import { CfnOutput, Duration } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as iam from "aws-cdk-lib/aws-iam";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { BaseStack } from "../base-stack.js";

export class DeliveryStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.signingSecret = new secretsmanager.Secret(this, "CloudFrontSigningKeySecret", {
      secretName: "cloudfront/signing-key",
      description: "Private key used by Lambda to generate CloudFront signed URLs."
    });

    const oac = new cloudfront.CfnOriginAccessControl(this, "ProcessedVideoOac", {
      originAccessControlConfig: {
        name: "VideoProcessedOAC",
        originAccessControlOriginType: "s3",
        signingBehavior: "always",
        signingProtocol: "sigv4"
      }
    });

    const trustedKeyGroup = process.env.CF_KEY_GROUP_ID
      ? cloudfront.KeyGroup.fromKeyGroupId(this, "TrustedVideoKeyGroup", process.env.CF_KEY_GROUP_ID)
      : undefined;

    this.distribution = new cloudfront.Distribution(this, "VideoDistribution", {
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      minimumProtocolVersion: cloudfront.SecurityPolicyProtocol.TLS_V1_2_2021,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withBucketDefaults(props.processedBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD_OPTIONS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED
      },
      additionalBehaviors: {
        "*.m3u8": {
          origin: origins.S3BucketOrigin.withBucketDefaults(props.processedBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          trustedKeyGroups: trustedKeyGroup ? [trustedKeyGroup] : undefined,
          cachePolicy: new cloudfront.CachePolicy(this, "ManifestCachePolicy", {
            minTtl: Duration.seconds(0),
            defaultTtl: Duration.seconds(0),
            maxTtl: Duration.seconds(1)
          })
        },
        "*.ts": {
          origin: origins.S3BucketOrigin.withBucketDefaults(props.processedBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, "SegmentCachePolicy", {
            minTtl: Duration.hours(1),
            defaultTtl: Duration.days(1),
            maxTtl: Duration.days(30)
          })
        },
        "*.jpg": {
          origin: origins.S3BucketOrigin.withBucketDefaults(props.thumbnailsBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, "ThumbnailCachePolicy", {
            minTtl: Duration.hours(1),
            defaultTtl: Duration.days(7),
            maxTtl: Duration.days(30)
          })
        },
        "*.vtt": {
          origin: origins.S3BucketOrigin.withBucketDefaults(props.subtitleBucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, "SubtitleCachePolicy", {
            minTtl: Duration.minutes(5),
            defaultTtl: Duration.days(1),
            maxTtl: Duration.days(7)
          })
        }
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 404, ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 404, ttl: Duration.minutes(1) }
      ]
    });

    const cfnDistribution = this.distribution.node.defaultChild;
    for (let i = 0; i < 4; i += 1) {
      cfnDistribution.addPropertyOverride(`DistributionConfig.Origins.${i}.OriginAccessControlId`, oac.attrId);
      cfnDistribution.addPropertyOverride(`DistributionConfig.Origins.${i}.S3OriginConfig.OriginAccessIdentity`, "");
    }

    for (const bucket of [props.processedBucket, props.thumbnailsBucket, props.subtitleBucket]) {
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: [new iam.ServicePrincipal("cloudfront.amazonaws.com")],
          actions: ["s3:GetObject"],
          resources: [bucket.arnForObjects("*")],
          conditions: {
            StringLike: {
              "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/*`
            }
          }
        })
      );
      bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.DENY,
          principals: [new iam.StarPrincipal()],
          actions: ["s3:GetObject"],
          resources: [bucket.arnForObjects("*")],
          conditions: {
            StringNotLike: {
              "AWS:SourceArn": `arn:aws:cloudfront::${this.account}:distribution/*`
            }
          }
        })
      );
    }

    new CfnOutput(this, "CloudFrontDomain", { value: this.distribution.distributionDomainName });
    new CfnOutput(this, "CloudFrontDistributionId", { value: this.distribution.distributionId });
    new CfnOutput(this, "CloudFrontSigningSecretName", { value: this.signingSecret.secretName });
  }
}
