import { RemovalPolicy, CfnOutput, Duration } from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as kms from "aws-cdk-lib/aws-kms";
import * as s3 from "aws-cdk-lib/aws-s3";
import { BaseStack } from "../base-stack.js";

export class StorageStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.platformKey = new kms.Key(this, "PlatformKey", {
      description: "Video platform encryption key",
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN
    });

    this.rawBucket = new s3.Bucket(this, "RawVideoBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.platformKey,
      eventBridgeEnabled: true,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT],
          allowedOrigins: ["*"],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"]
        }
      ],
      lifecycleRules: [
        {
          transitions: [
            { storageClass: s3.StorageClass.INFREQUENT_ACCESS, transitionAfter: Duration.days(30) },
            { storageClass: s3.StorageClass.GLACIER, transitionAfter: Duration.days(90) }
          ]
        }
      ],
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    this.processedBucket = new s3.Bucket(this, "ProcessedVideoBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    this.thumbnailsBucket = new s3.Bucket(this, "ThumbnailsBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    this.subtitleBucket = new s3.Bucket(this, "SubtitleBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.platformKey,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    this.table = new dynamodb.Table(this, "VideoPlatformTable", {
      tableName: "video-platform-table",
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.CUSTOMER_MANAGED,
      encryptionKey: this.platformKey,
      timeToLiveAttribute: "ttl",
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.DESTROY
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "GSI1",
      partitionKey: { name: "GSI1PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI1SK", type: dynamodb.AttributeType.STRING }
    });

    this.table.addGlobalSecondaryIndex({
      indexName: "GSI2",
      partitionKey: { name: "GSI2PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "GSI2SK", type: dynamodb.AttributeType.STRING }
    });

    new CfnOutput(this, "RawBucketName", { value: this.rawBucket.bucketName });
    new CfnOutput(this, "ProcessedBucketName", { value: this.processedBucket.bucketName });
    new CfnOutput(this, "ThumbnailsBucketName", { value: this.thumbnailsBucket.bucketName });
    new CfnOutput(this, "SubtitleBucketName", { value: this.subtitleBucket.bucketName });
    new CfnOutput(this, "TableName", { value: this.table.tableName });
    new CfnOutput(this, "PlatformKeyArn", { value: this.platformKey.keyArn });
  }
}
