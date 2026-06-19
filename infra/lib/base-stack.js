import { Stack, Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";

export class BaseStack extends Stack {
  functionCode() {
    return lambda.Code.fromAsset("..", {
      exclude: [
        "infra/node_modules",
        "infra/cdk.out",
        "frontend/node_modules",
        "frontend/dist",
        ".git",
        "**/*.log"
      ]
    });
  }

  commonEnvironment(extra = {}) {
    return {
      CORS_ORIGIN: this.node.tryGetContext("frontendOrigin") || "*",
      BEDROCK_MODEL_ID: this.node.tryGetContext("bedrockModelId") || "apac.amazon.nova-pro-v1:0",
      ...extra
    };
  }

  createLambda(id, functionPath, props = {}) {
    const role = new iam.Role(this, `${id}Role`, {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: `Least-privilege execution role for ${id}`
    });

    role.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole"));

    const logGroup = new logs.LogGroup(this, `${id}LogGroup`, {
      retention: logs.RetentionDays.ONE_MONTH
    });

    const fn = new lambda.Function(this, id, {
      runtime: lambda.Runtime.NODEJS_20_X,
      architecture: lambda.Architecture.ARM_64,
      handler: `functions/${functionPath}/index.handler`,
      code: this.functionCode(),
      timeout: props.timeout || Duration.seconds(15),
      memorySize: props.memorySize || 256,
      role,
      tracing: lambda.Tracing.ACTIVE,
      logGroup,
      environment: this.commonEnvironment(props.environment)
    });

    return { fn, role };
  }

  addRolePolicy(role, actions, resources = ["*"]) {
    role.addToPolicy(
      new iam.PolicyStatement({
        actions,
        resources
      })
    );
  }
}
