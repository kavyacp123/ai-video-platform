import { Amplify } from "aws-amplify";

export function configureAmplify() {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
        identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
        loginWith: {
          oauth: {
            domain: import.meta.env.VITE_COGNITO_DOMAIN || "video-platform-auth.auth.ap-south-1.amazoncognito.com",
            scopes: ["email", "profile", "openid"],
            redirectSignIn: [`${window.location.origin}/auth/callback`],
            redirectSignOut: [window.location.origin],
            responseType: "code"
          }
        }
      }
    }
  });
}

