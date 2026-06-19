import { CfnOutput, Duration } from "aws-cdk-lib";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as logs from "aws-cdk-lib/aws-logs";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as iam from "aws-cdk-lib/aws-iam";
import { BaseStack } from "../base-stack.js";

export class CustomTranscoderStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    this.queue = new sqs.Queue(this, "CustomTranscodeQueue", {
      queueName: "custom-transcode-queue.fifo",
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: Duration.minutes(20),
      retentionPeriod: Duration.days(4)
    });

    // Import the pipeline's FFmpeg queue (the one Step Functions sends jobs to)
    const pipelineQueue = sqs.Queue.fromQueueAttributes(this, "PipelineFfmpegQueue", {
      queueName: "workers-ffmpeg-worker-queue.fifo",
      queueArn: `arn:aws:sqs:${this.region}:${this.account}:workers-ffmpeg-worker-queue.fifo`
    });

    const env = {
      TABLE_NAME: props.storage.table.tableName,
      RAW_BUCKET_NAME: props.storage.rawBucket.bucketName,
      PROCESSED_BUCKET_NAME: props.storage.processedBucket.bucketName,
      THUMBNAIL_BUCKET_NAME: props.storage.thumbnailsBucket.bucketName,
      EVENT_BUS_NAME: props.eventBus.eventBusName,
      CLOUDFRONT_DOMAIN: props.cloudFrontDomain,
      TRANSCODE_QUEUE_URL: pipelineQueue.queueUrl
    };

    this.orchestrator = this.createLambda("CustomTranscodeOrchestratorFunction", "custom-transcode-orchestrator", {
      timeout: Duration.seconds(30),
      environment: env
    });

    this.playlistAssembler = this.createLambda("PlaylistAssemblerFunction", "playlist-assembler", {
      timeout: Duration.seconds(30),
      environment: env
    });

    props.storage.table.grantReadWriteData(this.orchestrator.fn);
    props.storage.table.grantReadWriteData(this.playlistAssembler.fn);
    props.storage.processedBucket.grantPut(this.playlistAssembler.fn);
    props.eventBus.grantPutEventsTo(this.playlistAssembler.fn);
    this.queue.grantSendMessages(this.orchestrator.fn);

    const vpc = new ec2.Vpc(this, "CustomTranscoderVpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: ec2.SubnetType.PUBLIC
        }
      ]
    });

    this.cluster = new ecs.Cluster(this, "FfmpegCluster", { vpc });

    const task = new ecs.FargateTaskDefinition(this, "FfmpegWorkerTask", {
      cpu: 2048,
      memoryLimitMiB: 4096,
      runtimePlatform: {
        cpuArchitecture: ecs.CpuArchitecture.ARM64,
        operatingSystemFamily: ecs.OperatingSystemFamily.LINUX
      }
    });

    pipelineQueue.grantConsumeMessages(task.taskRole);
    props.storage.rawBucket.grantRead(task.taskRole);
    props.storage.processedBucket.grantReadWrite(task.taskRole);
    props.storage.thumbnailsBucket.grantReadWrite(task.taskRole);
    props.eventBus.grantPutEventsTo(task.taskRole);
    // Allow worker to send task token callbacks to Step Functions
    task.taskRole.addToPrincipalPolicy(new iam.PolicyStatement({
      actions: ["states:SendTaskSuccess", "states:SendTaskFailure"],
      resources: ["*"]
    }));

    const workerLogGroup = new logs.LogGroup(this, "FfmpegWorkerLogGroup", {
      retention: logs.RetentionDays.ONE_MONTH
    });

    task.addContainer("FfmpegWorker", {
      image: ecs.ContainerImage.fromEcrRepository(
        ecr.Repository.fromRepositoryName(this, "FFmpegRepo", "ffmpeg-worker"),
        process.env.IMAGE_TAG || "latest"
      ),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "ffmpeg-worker",
        logGroup: workerLogGroup
      }),
      environment: env,
      stopTimeout: Duration.seconds(110)
    });

    this.service = new ecs.FargateService(this, "FfmpegWorkerService", {
      cluster: this.cluster,
      taskDefinition: task,
      desiredCount: 0,
      circuitBreaker: { rollback: true },
      minHealthyPercent: 100,
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC }
    });

    const scalableTarget = this.service.autoScaleTaskCount({
      minCapacity: 1,
      maxCapacity: 20
    });

    scalableTarget.scaleToTrackCustomMetric("ScaleOnQueueDepth", {
      targetValue: 5,
      scaleInCooldown: Duration.minutes(5),
      scaleOutCooldown: Duration.minutes(1),
      metric: new cloudwatch.Metric({
        namespace: "AWS/SQS",
        metricName: "ApproximateNumberOfMessagesVisible",
        dimensionsMap: { QueueName: "workers-ffmpeg-worker-queue.fifo" },
        statistic: "Average",
        period: Duration.minutes(1)
      })
    });

    new events.Rule(this, "RenditionCompleteRule", {
      eventBus: props.eventBus,
      eventPattern: {
        source: ["video-platform.custom-transcoder"],
        detailType: ["RENDITION_COMPLETE"]
      },
      targets: [new targets.LambdaFunction(this.playlistAssembler.fn)]
    });

    new CfnOutput(this, "CustomTranscodeQueueUrl", { value: this.queue.queueUrl });
    new CfnOutput(this, "FfmpegClusterName", { value: this.cluster.clusterName });
  }
}
