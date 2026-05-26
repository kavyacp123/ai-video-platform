import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import { Construct } from "constructs";

export class VideoPlatformStack extends Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const mediaConvertEndpoint = this.node.tryGetContext("mediaConvertEndpoint");

    if (!mediaConvertEndpoint) {
      throw new Error(
        "Missing context: mediaConvertEndpoint. Example: npx cdk deploy -c mediaConvertEndpoint=https://xxxx.mediaconvert.ap-south-1.amazonaws.com"
      );
    }

    const rawBucket = new s3.Bucket(this, "RawVideoBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"]
        }
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const processedBucket = new s3.Bucket(this, "ProcessedVideoBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET, s3.HttpMethods.HEAD],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"]
        }
      ],
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const videosTable = new dynamodb.Table(this, "VideosTable", {
      partitionKey: { name: "videoId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });

    const distribution = new cloudfront.Distribution(this, "VideoDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(processedBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.CORS_ALLOW_ALL_ORIGINS_WITH_PREFLIGHT
      }
    });

    const mediaConvertRole = new iam.Role(this, "MediaConvertRole", {
      assumedBy: new iam.ServicePrincipal("mediaconvert.amazonaws.com")
    });
    rawBucket.grantRead(mediaConvertRole);
    processedBucket.grantReadWrite(mediaConvertRole);

    const commonEnvironment = {
      RAW_BUCKET_NAME: rawBucket.bucketName,
      PROCESSED_BUCKET_NAME: processedBucket.bucketName,
      VIDEOS_TABLE_NAME: videosTable.tableName,
      CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
      MEDIACONVERT_ENDPOINT: mediaConvertEndpoint,
      MEDIACONVERT_ROLE_ARN: mediaConvertRole.roleArn
    };

    const createUploadUrl = new lambda.Function(this, "CreateUploadUrlFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "createUploadUrl.handler",
      code: lambda.Code.fromAsset("../backend/lambdas"),
      timeout: Duration.seconds(10),
      environment: commonEnvironment
    });

    const getVideo = new lambda.Function(this, "GetVideoFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "getVideo.handler",
      code: lambda.Code.fromAsset("../backend/lambdas"),
      timeout: Duration.seconds(10),
      environment: commonEnvironment
    });

    const supervisorAgent = new lambda.Function(this, "SupervisorAgentFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "supervisorAgent.handler",
      code: lambda.Code.fromAsset("../backend/lambdas"),
      timeout: Duration.seconds(20),
      environment: commonEnvironment
    });

    const startMediaConvertJob = new lambda.Function(this, "StartMediaConvertJobFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "startMediaConvertJob.handler",
      code: lambda.Code.fromAsset("../backend/lambdas"),
      timeout: Duration.seconds(30),
      environment: commonEnvironment
    });

    const handleMediaConvertEvent = new lambda.Function(this, "HandleMediaConvertEventFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handleMediaConvertEvent.handler",
      code: lambda.Code.fromAsset("../backend/lambdas"),
      timeout: Duration.seconds(10),
      environment: commonEnvironment
    });

    rawBucket.grantPut(createUploadUrl);
    videosTable.grantReadWriteData(createUploadUrl);
    videosTable.grantReadData(getVideo);
    videosTable.grantReadWriteData(supervisorAgent);
    videosTable.grantReadWriteData(startMediaConvertJob);
    videosTable.grantReadWriteData(handleMediaConvertEvent);
    rawBucket.grantRead(supervisorAgent);
    rawBucket.grantRead(startMediaConvertJob);
    processedBucket.grantReadWrite(startMediaConvertJob);
    supervisorAgent.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["events:PutEvents"],
        resources: ["*"]
      })
    );
    mediaConvertRole.grantPassRole(startMediaConvertJob);
    startMediaConvertJob.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["mediaconvert:CreateJob"],
        resources: ["*"]
      })
    );

    rawBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED_PUT,
      new s3n.LambdaDestination(supervisorAgent)
    );

    new events.Rule(this, "AiPlanCreatedRule", {
      eventPattern: {
        source: ["ai-video-platform"],
        detailType: ["AI_PLAN_CREATED"]
      },
      targets: [new targets.LambdaFunction(startMediaConvertJob)]
    });

    new events.Rule(this, "MediaConvertJobStateRule", {
      eventPattern: {
        source: ["aws.mediaconvert"],
        detailType: ["MediaConvert Job State Change"],
        detail: {
          status: ["COMPLETE", "ERROR", "CANCELED"]
        }
      },
      targets: [new targets.LambdaFunction(handleMediaConvertEvent)]
    });

    const api = new apigwv2.HttpApi(this, "VideoApi", {
      corsPreflight: {
        allowHeaders: ["content-type", "authorization"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS
        ],
        allowOrigins: ["*"]
      }
    });

    api.addRoutes({
      path: "/upload-url",
      methods: [apigwv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("CreateUploadUrlIntegration", createUploadUrl)
    });

    api.addRoutes({
      path: "/video/{videoId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("GetVideoIntegration", getVideo)
    });

    new cdk.CfnOutput(this, "ApiUrl", { value: api.url });
    new cdk.CfnOutput(this, "CloudFrontDomain", { value: distribution.distributionDomainName });
    new cdk.CfnOutput(this, "RawBucketName", { value: rawBucket.bucketName });
    new cdk.CfnOutput(this, "ProcessedBucketName", { value: processedBucket.bucketName });
  }
}
