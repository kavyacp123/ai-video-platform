export const amplifyConfig = {
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      identityPoolId: import.meta.env.VITE_IDENTITY_POOL_ID,
      loginWith: {
        oauth: {
          domain: import.meta.env.VITE_COGNITO_DOMAIN,
          scopes: ["openid", "email", "profile"],
          redirectSignIn: [import.meta.env.VITE_AUTH_REDIRECT_SIGN_IN || "http://localhost:5173/dashboard"],
          redirectSignOut: [import.meta.env.VITE_AUTH_REDIRECT_SIGN_OUT || "http://localhost:5173/auth"],
          responseType: "code"
        }
      }
    }
  },
  API: {
    REST: {
      videoPlatform: {
        endpoint: import.meta.env.VITE_API_URL
      }
    }
  }
};

