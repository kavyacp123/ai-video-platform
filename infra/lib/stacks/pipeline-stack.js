import { CfnOutput, Duration } from "aws-cdk-lib";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { BaseStack } from "../base-stack.js";

export class PipelineStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const env = {
      TABLE_NAME: props.storage.table.tableName,
      RAW_BUCKET_NAME: props.storage.rawBucket.bucketName,
      PROCESSED_BUCKET_NAME: props.storage.processedBucket.bucketName,
      THUMBNAIL_BUCKET_NAME: props.storage.thumbnailsBucket.bucketName,
      SUBTITLE_BUCKET_NAME: props.storage.subtitleBucket.bucketName,
      EVENT_BUS_NAME: props.eventBus.eventBusName,
      CLOUDFRONT_DOMAIN: props.cloudFrontDomain,
      CLOUDFRONT_DISTRIBUTION_ID: props.cloudFrontDistributionId || "",
      MEDIACONVERT_ENDPOINT: props.mediaConvertEndpoint
    };

    const mediaConvertRole = new iam.Role(this, "MediaConvertRole", {
      assumedBy: new iam.ServicePrincipal("mediaconvert.amazonaws.com")
    });
    props.storage.rawBucket.grantRead(mediaConvertRole);
    props.storage.processedBucket.grantReadWrite(mediaConvertRole);
    env.MEDIACONVERT_ROLE_ARN = mediaConvertRole.roleArn;
    const ffmpegQueue = new sqs.Queue(this, "PipelineFfmpegQueue", {
      queueName: "workers-ffmpeg-worker-queue.fifo",
      fifo: true,
      contentBasedDeduplication: true,
      visibilityTimeout: Duration.hours(2)
    });
    env.TRANSCODE_QUEUE_URL = ffmpegQueue.queueUrl;

    const supervisor = this.createLambda("AiSupervisorFunction", "ai-supervisor", {
      timeout: Duration.seconds(30),
      environment: env
    });
    this.supervisorFn = supervisor.fn;
    const validateInput = this.createLambda("ValidateInputFunction", "validate-input", { environment: env });
    const aggregateResults = this.createLambda("AggregateResultsFunction", "aggregate-results", { environment: env });
    const handleFailure = this.createLambda("HandleFailureFunction", "handle-failure", { environment: env });
    const startTranscode = this.createLambda("StartTranscodeFunction", "start-transcode", {
      timeout: Duration.seconds(30),
      environment: env
    });
    const mediaConvertCallback = this.createLambda("MediaConvertCallbackFunction", "mediaconvert-callback", {
      timeout: Duration.seconds(15),
      environment: env
    });
    const startFfmpegJob = this.createLambda("StartFfmpegJobFunction", "start-ffmpeg-job", {
      timeout: Duration.seconds(15),
      environment: env
    });
    const pollTranscode = this.createLambda("PollTranscodeFunction", "poll-transcode", { environment: env });
    const startTranscription = this.createLambda("StartTranscriptionFunction", "start-transcription", {
      environment: env
    });
    const pollTranscription = this.createLambda("PollTranscriptionFunction", "poll-transcription", { environment: env });
    const translateSubtitles = this.createLambda("TranslateSubtitlesFunction", "translate-subtitles", {
      timeout: Duration.minutes(5),
      environment: env
    });
    const extractFrames = this.createLambda("ExtractFramesFunction", "extract-frames", { environment: env });
    const runModeration = this.createLambda("RunModerationFunction", "run-moderation", {
      timeout: Duration.minutes(2),
      environment: env
    });
    const generateThumbnail = this.createLambda("GenerateThumbnailFunction", "generate-thumbnail", { environment: env });
    const generateClips = this.createLambda("GenerateClipsFunction", "generate-clips", { environment: env });
    const markDeleting = this.createLambda("MarkDeletingFunction", "mark-deleting", { environment: env });
    const deleteRawVideo = this.createLambda("DeleteRawVideoFunction", "delete-raw-video", { environment: env });
    const deleteS3Prefix = this.createLambda("DeleteS3PrefixFunction", "delete-s3-prefix", {
      timeout: Duration.minutes(5),
      environment: env
    });
    const invalidateCloudFront = this.createLambda("InvalidateCloudFrontFunction", "invalidate-cloudfront", {
      timeout: Duration.seconds(30),
      environment: env
    });
    const deleteVideoRecord = this.createLambda("DeleteVideoRecordFunction", "delete-video-record", {
      timeout: Duration.minutes(2),
      environment: env
    });
    const markDeleteFailed = this.createLambda("MarkDeleteFailedFunction", "mark-delete-failed", { environment: env });

    for (const item of [
      supervisor,
      validateInput,
      aggregateResults,
      handleFailure,
      startTranscode,
      mediaConvertCallback,
      startFfmpegJob,
      pollTranscode,
      startTranscription,
      pollTranscription,
      translateSubtitles,
      extractFrames,
      runModeration,
      generateThumbnail,
      generateClips,
      markDeleting,
      deleteRawVideo,
      deleteS3Prefix,
      invalidateCloudFront,
      deleteVideoRecord,
      markDeleteFailed
    ]) {
      props.storage.table.grantReadWriteData(item.fn);
      props.eventBus.grantPutEventsTo(item.fn);
    }

    props.storage.rawBucket.grantRead(supervisor.fn);
    props.storage.rawBucket.grantRead(startTranscode.fn);
    props.storage.rawBucket.grantRead(startTranscription.fn);
    props.storage.rawBucket.grantDelete(deleteRawVideo.fn);
    props.storage.processedBucket.grantReadWrite(startTranscode.fn);
    props.storage.processedBucket.grantReadWrite(mediaConvertCallback.fn);
    props.storage.processedBucket.grantReadWrite(deleteS3Prefix.fn);
    props.storage.subtitleBucket.grantReadWrite(startTranscription.fn);
    props.storage.subtitleBucket.grantReadWrite(translateSubtitles.fn);
    props.storage.subtitleBucket.grantReadWrite(deleteS3Prefix.fn);
    props.storage.thumbnailsBucket.grantReadWrite(extractFrames.fn);
    props.storage.thumbnailsBucket.grantRead(runModeration.fn);
    props.storage.thumbnailsBucket.grantReadWrite(deleteS3Prefix.fn);
    mediaConvertRole.grantPassRole(startTranscode.fn);
    this.addRolePolicy(supervisor.role, ["bedrock:InvokeModel"], ["*"]);
    this.addRolePolicy(startTranscode.role, ["mediaconvert:CreateJob"], ["*"]);
    this.addRolePolicy(mediaConvertCallback.role, ["states:SendTaskSuccess", "states:SendTaskFailure"], ["*"]);
    ffmpegQueue.grantSendMessages(startFfmpegJob.fn);
    ffmpegQueue.grantSendMessages(extractFrames.fn);
    ffmpegQueue.grantSendMessages(generateThumbnail.fn);
    ffmpegQueue.grantSendMessages(generateClips.fn);
    this.addRolePolicy(pollTranscode.role, ["mediaconvert:GetJob"], ["*"]);
    this.addRolePolicy(startTranscription.role, ["transcribe:StartTranscriptionJob"], ["*"]);
    this.addRolePolicy(pollTranscription.role, ["transcribe:GetTranscriptionJob"], ["*"]);
    this.addRolePolicy(translateSubtitles.role, ["translate:TranslateText"], ["*"]);
    this.addRolePolicy(runModeration.role, ["rekognition:DetectModerationLabels"], ["*"]);
    this.addRolePolicy(invalidateCloudFront.role, ["cloudfront:CreateInvalidation"], ["*"]);

    const retry = {
      errors: ["Lambda.ServiceException", "Lambda.TooManyRequestsException"],
      interval: Duration.seconds(2),
      maxAttempts: 3,
      backoffRate: 2
    };

    const validate = new tasks.LambdaInvoke(this, "ValidateInput", {
      lambdaFunction: validateInput.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const startMediaConvertJob = new tasks.LambdaInvoke(this, "StartMediaConvertJob", {
      lambdaFunction: startTranscode.fn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        "s3Key.$": "$.s3Key",
        "rawBucket.$": "$.rawBucket",
        "fileSize.$": "$.fileSize",
        "plan.$": "$.plan",
        taskToken: sfn.JsonPath.taskToken
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const startFfmpeg = new tasks.LambdaInvoke(this, "StartFFmpegJob", {
      lambdaFunction: startFfmpegJob.fn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      heartbeatTimeout: sfn.Timeout.duration(Duration.hours(1)),
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        "s3Key.$": "$.s3Key",
        "rawBucket.$": "$.rawBucket",
        "fileSize.$": "$.fileSize",
        "plan.$": "$.plan",
        taskToken: sfn.JsonPath.taskToken
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const transcodeChoice = new sfn.Choice(this, "ChooseTranscodingEngine")
      .when(
        sfn.Condition.or(
          sfn.Condition.numberGreaterThanEquals("$.fileSize", 2147483648),
          sfn.Condition.booleanEquals("$.plan.generateHighlights", true)
        ),
        startFfmpeg
      )
      .otherwise(startMediaConvertJob);

    const subtitleBranch = new sfn.Choice(this, "ShouldGenerateSubtitles")
      .when(
        sfn.Condition.booleanEquals("$.plan.generateSubtitles", true),
        new tasks.LambdaInvoke(this, "StartTranscribeJob", {
          lambdaFunction: startTranscription.fn,
          outputPath: "$.Payload"
        })
          .addRetry(retry)
          .next(new sfn.Wait(this, "WaitForTranscribe", { time: sfn.WaitTime.duration(Duration.seconds(15)) }))
          .next(
            new tasks.LambdaInvoke(this, "PollTranscribe", {
              lambdaFunction: pollTranscription.fn,
              outputPath: "$.Payload"
            }).addRetry(retry)
          )
          .next(
            new tasks.LambdaInvoke(this, "TranslateSubtitles", {
              lambdaFunction: translateSubtitles.fn,
              outputPath: "$.Payload"
            }).addRetry(retry)
          )
      )
      .otherwise(new sfn.Pass(this, "SkipSubtitles"));

    const moderationBranch = new sfn.Choice(this, "ShouldModerate")
      .when(
        sfn.Condition.not(sfn.Condition.stringEquals("$.plan.moderationLevel", "none")),
        new tasks.LambdaInvoke(this, "ExtractFrames", {
          lambdaFunction: extractFrames.fn,
          integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
          heartbeatTimeout: sfn.Timeout.duration(Duration.hours(1)),
          payload: sfn.TaskInput.fromObject({
            "videoId.$": "$.videoId",
            "userId.$": "$.userId",
            "s3Key.$": "$.s3Key",
            "rawBucket.$": "$.rawBucket",
            "plan.$": "$.plan",
            taskToken: sfn.JsonPath.taskToken
          }),
          outputPath: "$.Payload"
        })
          .addRetry(retry)
          .next(
            new tasks.LambdaInvoke(this, "RunModeration", {
              lambdaFunction: runModeration.fn,
              outputPath: "$.Payload"
            }).addRetry(retry)
          )
      )
      .otherwise(new sfn.Pass(this, "SkipModeration"));

    const thumbnailBranch = new sfn.Choice(this, "ShouldGenerateThumbnail")
      .when(
        sfn.Condition.booleanEquals("$.plan.generateThumbnail", true),
        new tasks.LambdaInvoke(this, "GenerateThumbnail", {
          lambdaFunction: generateThumbnail.fn,
          integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
          heartbeatTimeout: sfn.Timeout.duration(Duration.hours(1)),
          payload: sfn.TaskInput.fromObject({
            "videoId.$": "$.videoId",
            "userId.$": "$.userId",
            "s3Key.$": "$.s3Key",
            "rawBucket.$": "$.rawBucket",
            "plan.$": "$.plan",
            taskToken: sfn.JsonPath.taskToken
          }),
          outputPath: "$.Payload"
        }).addRetry(retry)
      )
      .otherwise(new sfn.Pass(this, "SkipThumbnail"));

    const clipsBranch = new sfn.Choice(this, "ShouldGenerateClips")
      .when(
        sfn.Condition.booleanEquals("$.plan.generateHighlights", true),
        new tasks.LambdaInvoke(this, "GenerateClips", {
          lambdaFunction: generateClips.fn,
          integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
          heartbeatTimeout: sfn.Timeout.duration(Duration.hours(1)),
          payload: sfn.TaskInput.fromObject({
            "videoId.$": "$.videoId",
            "userId.$": "$.userId",
            "s3Key.$": "$.s3Key",
            "rawBucket.$": "$.rawBucket",
            "plan.$": "$.plan",
            taskToken: sfn.JsonPath.taskToken
          }),
          outputPath: "$.Payload"
        }).addRetry(retry)
      )
      .otherwise(new sfn.Pass(this, "SkipClips"));

    const parallel = new sfn.Parallel(this, "ParallelPipelines")
      .branch(transcodeChoice)
      .branch(subtitleBranch)
      .branch(moderationBranch)
      .branch(thumbnailBranch)
      .branch(clipsBranch);

    const aggregate = new tasks.LambdaInvoke(this, "AggregateResults", {
      lambdaFunction: aggregateResults.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const failure = new tasks.LambdaInvoke(this, "HandleFailure", {
      lambdaFunction: handleFailure.fn,
      outputPath: "$.Payload"
    });

    const definition = validate.next(parallel).next(aggregate);
    parallel.addCatch(failure, { resultPath: "$.failure" });

    this.stateMachine = new sfn.StateMachine(this, "VideoProcessingPipeline", {
      stateMachineName: "video-processing-pipeline",
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      tracingEnabled: true
    });

    const markDeletingState = new tasks.LambdaInvoke(this, "MarkDeleting", {
      lambdaFunction: markDeleting.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteRawState = new tasks.LambdaInvoke(this, "DeleteRawVideo", {
      lambdaFunction: deleteRawVideo.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteHlsState = new tasks.LambdaInvoke(this, "DeleteHLSOutput", {
      lambdaFunction: deleteS3Prefix.fn,
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        bucket: props.storage.processedBucket.bucketName,
        "prefix.$": "States.Format('hls/{}/', $.videoId)",
        assetType: "HLS"
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteCustomHlsState = new tasks.LambdaInvoke(this, "DeleteCustomHLSOutput", {
      lambdaFunction: deleteS3Prefix.fn,
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        bucket: props.storage.processedBucket.bucketName,
        "prefix.$": "States.Format('custom-hls/{}/', $.videoId)",
        assetType: "CUSTOM_HLS"
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteSubtitleState = new tasks.LambdaInvoke(this, "DeleteSubtitles", {
      lambdaFunction: deleteS3Prefix.fn,
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        bucket: props.storage.subtitleBucket.bucketName,
        "prefix.$": "States.Format('{}/', $.videoId)",
        assetType: "SUBTITLES"
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteThumbnailState = new tasks.LambdaInvoke(this, "DeleteThumbnails", {
      lambdaFunction: deleteS3Prefix.fn,
      payload: sfn.TaskInput.fromObject({
        "videoId.$": "$.videoId",
        "userId.$": "$.userId",
        bucket: props.storage.thumbnailsBucket.bucketName,
        "prefix.$": "States.Format('{}/', $.videoId)",
        assetType: "THUMBNAILS"
      }),
      outputPath: "$.Payload"
    }).addRetry(retry);

    const invalidateState = new tasks.LambdaInvoke(this, "InvalidateCloudFront", {
      lambdaFunction: invalidateCloudFront.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const deleteAssets = new sfn.Parallel(this, "DeleteAssetsInParallel")
      .branch(deleteRawState)
      .branch(deleteHlsState)
      .branch(deleteCustomHlsState)
      .branch(deleteSubtitleState)
      .branch(deleteThumbnailState)
      .branch(invalidateState);

    const deleteRecordState = new tasks.LambdaInvoke(this, "DeleteDynamoRecord", {
      lambdaFunction: deleteVideoRecord.fn,
      outputPath: "$.Payload"
    }).addRetry(retry);

    const markDeleteFailedState = new tasks.LambdaInvoke(this, "MarkDeleteFailed", {
      lambdaFunction: markDeleteFailed.fn,
      outputPath: "$.Payload"
    });

    const deletionDefinition = markDeletingState.next(deleteAssets).next(deleteRecordState);
    deleteAssets.addCatch(markDeleteFailedState, { resultPath: "$.failure" });

    this.deletionStateMachine = new sfn.StateMachine(this, "VideoDeletionPipeline", {
      stateMachineName: "video-deletion-pipeline",
      stateMachineType: sfn.StateMachineType.EXPRESS,
      definitionBody: sfn.DefinitionBody.fromChainable(deletionDefinition),
      tracingEnabled: true
    });

    new events.Rule(this, "S3RawObjectCreatedRule", {
      eventPattern: {
        source: ["aws.s3"],
        detailType: ["Object Created"],
        detail: { bucket: { name: [props.storage.rawBucket.bucketName] } }
      },
      targets: [new targets.LambdaFunction(supervisor.fn)]
    });

    new events.Rule(this, "AiPlanCreatedRule", {
      eventBus: props.eventBus,
      eventPattern: {
        source: ["video-platform"],
        detailType: ["AI_PLAN_CREATED"]
      },
      targets: [
        new targets.SfnStateMachine(this.stateMachine, {
          input: events.RuleTargetInput.fromEventPath("$.detail")
        })
      ]
    });

    new events.Rule(this, "MediaConvertCallbackRule", {
      eventPattern: {
        source: ["aws.mediaconvert"],
        detailType: ["MediaConvert Job State Change"],
        detail: { status: ["COMPLETE", "ERROR", "CANCELED"] }
      },
      targets: [new targets.LambdaFunction(mediaConvertCallback.fn)]
    });

    new CfnOutput(this, "StateMachineArn", { value: this.stateMachine.stateMachineArn });
    new CfnOutput(this, "DeletionStateMachineArn", { value: this.deletionStateMachine.stateMachineArn });
  }
}
