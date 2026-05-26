# IAM Roles And Permissions

Every Lambda is created with its own execution role in `infra/lib/base-stack.js`.

Core role baseline for every Lambda:

- `AWSLambdaBasicExecutionRole`
- X-Ray tracing permissions through Lambda active tracing

API roles:

- `UploadUrlFunctionRole`: `s3:PutObject` on raw bucket, DynamoDB read/write on app table, `events:PutEvents`
- `GetVideoFunctionRole`: DynamoDB read on app table
- `GetStreamFunctionRole`: DynamoDB read, `secretsmanager:GetSecretValue` for CloudFront signing key
- `GetStatusFunctionRole`: DynamoDB read
- `ListVideosFunctionRole`: DynamoDB read
- `DeleteVideoFunctionRole`: DynamoDB read/write, `s3:DeleteObject` on raw bucket
- `DeleteVideoFunctionRole`: starts the deletion Step Functions workflow
- `WsConnectFunctionRole`: DynamoDB read/write
- `WsDisconnectFunctionRole`: DynamoDB read/write
- `WsDefaultFunctionRole`: CloudWatch logs only

Pipeline roles:

- `AiSupervisorFunctionRole`: DynamoDB read/write, `events:PutEvents`, `bedrock:InvokeModel`, raw bucket read
- `ValidateInputFunctionRole`: DynamoDB read/write
- `StartTranscodeFunctionRole`: raw bucket read, processed bucket write, `mediaconvert:CreateJob`, `iam:PassRole` for MediaConvert role
- `PollTranscodeFunctionRole`: `mediaconvert:GetJob`, `events:PutEvents`, DynamoDB read/write
- `StartTranscriptionFunctionRole`: raw bucket read, subtitle bucket write, `transcribe:StartTranscriptionJob`
- `PollTranscriptionFunctionRole`: `transcribe:GetTranscriptionJob`
- `TranslateSubtitlesFunctionRole`: subtitle bucket read/write, `translate:TranslateText`, `events:PutEvents`
- `ExtractFramesFunctionRole`: thumbnails bucket write
- `RunModerationFunctionRole`: thumbnails bucket read, `rekognition:DetectModerationLabels`, `events:PutEvents`
- `GenerateThumbnailFunctionRole`: DynamoDB read/write, `events:PutEvents`
- `GenerateClipsFunctionRole`: DynamoDB read/write
- `AggregateResultsFunctionRole`: DynamoDB read/write, `events:PutEvents`
- `HandleFailureFunctionRole`: DynamoDB read/write, `events:PutEvents`
- `MarkDeletingFunctionRole`: DynamoDB read/write
- `DeleteRawVideoFunctionRole`: raw bucket delete
- `DeleteS3PrefixFunctionRole`: processed/subtitle/thumbnail bucket list and delete
- `InvalidateCloudFrontFunctionRole`: `cloudfront:CreateInvalidation`
- `DeleteVideoRecordFunctionRole`: DynamoDB query and batch delete
- `MarkDeleteFailedFunctionRole`: DynamoDB read/write, `events:PutEvents`

Event roles:

- `NotificationFunctionRole`: DynamoDB read/write, `execute-api:ManageConnections`
- `AlertFunctionRole`: CloudWatch logs only

Service role:

- `MediaConvertRole`: read raw bucket, read/write processed bucket
