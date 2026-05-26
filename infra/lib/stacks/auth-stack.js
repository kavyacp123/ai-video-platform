import { Duration, CfnOutput, SecretValue } from "aws-cdk-lib";
import * as cognito from "aws-cdk-lib/aws-cognito";
import { BaseStack } from "../base-stack.js";

export class AuthStack extends BaseStack {
  constructor(scope, id, props) {
    super(scope, id, props);

    const postConfirmation = this.createLambda("PostConfirmationFunction", "post-confirmation", {
      environment: {
        TABLE_NAME: props.table.tableName
      }
    });
    props.table.grantReadWriteData(postConfirmation.fn);

    this.userPool = new cognito.UserPool(this, "UserPool", {
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      lambdaTriggers: {
        postConfirmation: postConfirmation.fn
      },
      standardAttributes: {
        email: { required: true, mutable: true }
      },
      passwordPolicy: {
        minLength: 8,
        requireDigits: true,
        requireLowercase: true,
        requireUppercase: true,
        requireSymbols: false
      }
    });

    if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
      this.googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, "GoogleProvider", {
        userPool: this.userPool,
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecretValue: SecretValue.unsafePlainText(process.env.GOOGLE_CLIENT_SECRET),
        scopes: ["email", "profile", "openid"],
        attributeMapping: {
          email: cognito.ProviderAttribute.GOOGLE_EMAIL,
          givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
          familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
          profilePicture: cognito.ProviderAttribute.GOOGLE_PICTURE
        }
      });
    }

    this.domain = this.userPool.addDomain("CognitoDomain", {
      cognitoDomain: {
        domainPrefix: this.node.tryGetContext("cognitoDomainPrefix") || "video-platform-auth"
      }
    });

    this.userPoolClient = new cognito.UserPoolClient(this, "FrontendUserPoolClient", {
      userPool: this.userPool,
      generateSecret: false,
      supportedIdentityProviders: this.googleProvider
        ? [cognito.UserPoolClientIdentityProvider.COGNITO, cognito.UserPoolClientIdentityProvider.GOOGLE]
        : [cognito.UserPoolClientIdentityProvider.COGNITO],
      authFlows: {
        userSrp: true,
        userPassword: true
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        callbackUrls: [
          "http://localhost:5173/auth/callback",
          this.node.tryGetContext("frontendCallbackUrl") || "https://yourdomain.com/auth/callback"
        ],
        logoutUrls: ["http://localhost:5173", this.node.tryGetContext("frontendLogoutUrl") || "https://yourdomain.com"]
      },
      accessTokenValidity: Duration.hours(1),
      idTokenValidity: Duration.hours(1)
    });
    if (this.googleProvider) {
      this.userPoolClient.node.addDependency(this.googleProvider);
    }

    this.identityPool = new cognito.CfnIdentityPool(this, "IdentityPool", {
      allowUnauthenticatedIdentities: false,
      cognitoIdentityProviders: [
        {
          clientId: this.userPoolClient.userPoolClientId,
          providerName: this.userPool.userPoolProviderName
        }
      ]
    });

    new CfnOutput(this, "UserPoolId", { value: this.userPool.userPoolId });
    new CfnOutput(this, "UserPoolClientId", { value: this.userPoolClient.userPoolClientId });
    new CfnOutput(this, "IdentityPoolId", { value: this.identityPool.ref });
    new CfnOutput(this, "CognitoDomain", { value: this.domain.domainName });
  }
}
