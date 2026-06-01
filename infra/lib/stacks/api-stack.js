import { CfnOutput, Duration } from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import { BaseStack } from "../base-stack.js";

export class ApiStack extends BaseStack {
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
      DELETION_STATE_MACHINE_ARN: props.deletionStateMachine?.stateMachineArn || ""
    };

    const uploadUrl = this.createApiLambda("UploadUrlFunction", "upload-url", env);
    const getVideo = this.createApiLambda("GetVideoFunction", "get-video", env);
    const getStream = this.createApiLambda("GetStreamFunction", "get-stream", env);
    const getStatus = this.createApiLambda("GetStatusFunction", "get-status", env);
    const listVideos = this.createApiLambda("ListVideosFunction", "list-videos", env);
    const deleteVideo = this.createApiLambda("DeleteVideoFunction", "delete-video", env);
    const wsConnect = this.createApiLambda("WsConnectFunction", "ws-connect", env);
    const wsDisconnect = this.createApiLambda("WsDisconnectFunction", "ws-disconnect", env);
    const wsDefault = this.createApiLambda("WsDefaultFunction", "ws-default", env);
    const jwtAuthorizerFn = this.createApiLambda("JwtAuthorizerFunction", "jwt-authorizer", {
      ...env,
      USER_POOL_ID: props.auth.userPool.userPoolId
    });

    // Social Features
    const createComment = this.createApiLambda("CreateCommentFunction", "create-comment", env);
    const getComments = this.createApiLambda("GetCommentsFunction", "get-comments", env);
    const likeVideo = this.createApiLambda("LikeVideoFunction", "like-video", env);
    const rateVideo = this.createApiLambda("RateVideoFunction", "rate-video", env);
    const followUser = this.createApiLambda("FollowUserFunction", "follow-user", env);

    // Analytics
    const trackWatchSession = this.createApiLambda("TrackWatchSessionFunction", "track-watch-session", env);
    const trackEngagement = this.createApiLambda("TrackEngagementFunction", "track-engagement", env);
    const getVideoAnalytics = this.createApiLambda("GetVideoAnalyticsFunction", "get-video-analytics", env);

    // Admin & Compliance
    const createViolationReport = this.createApiLambda("CreateViolationReportFunction", "create-violation-report", env);
    const getAuditLogs = this.createApiLambda("GetAuditLogsFunction", "get-audit-logs", env);

    this.criticalFunctions = [uploadUrl.fn, getStream.fn, jwtAuthorizerFn.fn];

    props.storage.table.grantReadWriteData(uploadUrl.fn);
    props.storage.table.grantReadData(getVideo.fn);
    props.storage.table.grantReadData(getStream.fn);
    props.storage.table.grantReadData(getStatus.fn);
    props.storage.table.grantReadData(listVideos.fn);
    props.storage.table.grantReadWriteData(deleteVideo.fn);
    props.storage.table.grantReadWriteData(wsConnect.fn);
    props.storage.table.grantReadWriteData(wsDisconnect.fn);

    // Grant permissions for social features
    props.storage.table.grantReadWriteData(createComment.fn);
    props.storage.table.grantReadData(getComments.fn);
    props.storage.table.grantReadWriteData(likeVideo.fn);
    props.storage.table.grantReadWriteData(rateVideo.fn);
    props.storage.table.grantReadWriteData(followUser.fn);

    // Grant permissions for analytics
    props.storage.table.grantReadWriteData(trackWatchSession.fn);
    props.storage.table.grantReadWriteData(trackEngagement.fn);
    props.storage.table.grantReadData(getVideoAnalytics.fn);

    // Grant permissions for admin
    props.storage.table.grantReadWriteData(createViolationReport.fn);
    props.storage.table.grantReadData(getAuditLogs.fn);

    props.storage.rawBucket.grantPut(uploadUrl.fn);
    props.storage.rawBucket.grantDelete(deleteVideo.fn);
    props.eventBus.grantPutEventsTo(uploadUrl.fn);
    if (props.deletionStateMachine) {
      props.deletionStateMachine.grantStartExecution(deleteVideo.fn);
    }
    this.addRolePolicy(getStream.role, ["secretsmanager:GetSecretValue"], ["*"]);

    const jwtAuthorizer = new authorizers.HttpLambdaAuthorizer("JwtAuthorizer", jwtAuthorizerFn.fn, {
      responseTypes: [authorizers.HttpLambdaResponseType.IAM],
      resultsCacheTtl: Duration.seconds(300),
      identitySource: ["$request.header.Authorization"]
    });

    this.httpApi = new apigwv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowOrigins: [this.node.tryGetContext("frontendOrigin") || "http://localhost:5173"],
        allowHeaders: ["content-type", "authorization"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS
        ]
      }
    });

    this.addRoute("POST", "/upload-url", uploadUrl.fn, jwtAuthorizer);
    this.addRoute("GET", "/video/{id}", getVideo.fn, jwtAuthorizer);
    this.addRoute("GET", "/stream/{id}", getStream.fn, jwtAuthorizer);
    this.addRoute("GET", "/status/{id}", getStatus.fn, jwtAuthorizer);
    this.addRoute("GET", "/videos", listVideos.fn, jwtAuthorizer);
    this.addRoute("DELETE", "/video/{id}", deleteVideo.fn, jwtAuthorizer);

    // Social Routes
    this.addRoute("POST", "/videos/{id}/comments", createComment.fn, jwtAuthorizer);
    this.addRoute("GET", "/videos/{id}/comments", getComments.fn, jwtAuthorizer);
    this.addRoute("POST", "/videos/{id}/like", likeVideo.fn, jwtAuthorizer);
    this.addRoute("DELETE", "/videos/{id}/like", likeVideo.fn, jwtAuthorizer);
    this.addRoute("POST", "/videos/{id}/rate", rateVideo.fn, jwtAuthorizer);
    this.addRoute("POST", "/users/{targetUserId}/follow", followUser.fn, jwtAuthorizer);
    this.addRoute("DELETE", "/users/{targetUserId}/follow", followUser.fn, jwtAuthorizer);

    // Analytics Routes
    this.addRoute("POST", "/videos/{id}/watch-session", trackWatchSession.fn, jwtAuthorizer);
    this.addRoute("POST", "/videos/{id}/engagement", trackEngagement.fn, jwtAuthorizer);
    this.addRoute("GET", "/videos/{id}/analytics", getVideoAnalytics.fn, jwtAuthorizer);

    // Admin Routes
    this.addRoute("POST", "/videos/{id}/report-violation", createViolationReport.fn, jwtAuthorizer);
    this.addRoute("GET", "/admin/audit-logs", getAuditLogs.fn, jwtAuthorizer);

    this.webSocketApi = new apigwv2.WebSocketApi(this, "WebSocketApi", {
      connectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration("WsConnectIntegration", wsConnect.fn)
      },
      disconnectRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration("WsDisconnectIntegration", wsDisconnect.fn)
      },
      defaultRouteOptions: {
        integration: new integrations.WebSocketLambdaIntegration("WsDefaultIntegration", wsDefault.fn)
      }
    });
    const stage = new apigwv2.WebSocketStage(this, "WebSocketStage", {
      webSocketApi: this.webSocketApi,
      stageName: "prod",
      autoDeploy: true
    });

    const notification = this.createApiLambda("NotificationFunction", "notification", {
      ...env,
      WEBSOCKET_CALLBACK_URL: stage.callbackUrl
    });
    props.storage.table.grantReadWriteData(notification.fn);
    this.addRolePolicy(notification.role, ["execute-api:ManageConnections"], ["*"]);

    new events.Rule(this, "VideoReadyNotificationRule", {
      eventBus: props.eventBus,
      eventPattern: {
        source: ["video-platform"],
        detailType: ["VIDEO_READY"]
      },
      targets: [new targets.LambdaFunction(notification.fn)]
    });

    new events.Rule(this, "VideoFailedNotificationRule", {
      eventBus: props.eventBus,
      eventPattern: {
        source: ["video-platform"],
        detailType: ["VIDEO_FAILED"]
      },
      targets: [new targets.LambdaFunction(notification.fn)]
    });

    new CfnOutput(this, "ApiGatewayUrl", { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, "WebSocketUrl", { value: stage.url });
  }

  createApiLambda(id, path, env) {
    return this.createLambda(id, path, {
      environment: env
    });
  }

  addRoute(method, path, fn, authorizer) {
    this.httpApi.addRoutes({
      path,
      methods: [apigwv2.HttpMethod[method]],
      authorizer,
      integration: new integrations.HttpLambdaIntegration(`${method}${path}Integration`, fn)
    });
  }
}
