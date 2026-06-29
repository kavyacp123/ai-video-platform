import { signInWithRedirect } from "aws-amplify/auth";
import { PlayCircle, Zap, Shield, Sparkles, UploadCloud, Globe, Cpu } from "lucide-react";

export default function LandingPage() {
  const handleSignIn = () => {
    signInWithRedirect({ provider: "Google" });
  };

  return (
    <div className="landing-page">
      {/* Navbar */}
      <nav className="landing-navbar">
        <div className="landing-brand">
          <PlayCircle size={28} className="brand-icon" />
          <span>StreamMind</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={handleSignIn}>
          Sign In
        </button>
      </nav>

      <main className="landing-main">
        {/* Hero Section */}
        <section className="hero-section">
          <div className="hero-background">
            <div className="hero-glow hero-glow-1"></div>
            <div className="hero-glow hero-glow-2"></div>
            <div className="hero-glow hero-glow-3"></div>
          </div>
          
          <div className="hero-content fade-in">
            <div className="badge-pill">
              <Sparkles size={14} />
              <span>Next-Generation AI Video Platform</span>
            </div>
            
            <h1 className="hero-title">
              Transform Your Videos with <br />
              <span className="text-gradient">Intelligent Processing</span>
            </h1>
            
            <p className="hero-subtitle">
              StreamMind leverages cutting-edge AI to automatically transcode, moderate, and analyze your video content. Delivering seamless, high-definition streaming globally.
            </p>
            
            <button className="google-sign-in-btn hero-cta" onClick={handleSignIn}>
              <svg className="google-icon" viewBox="0 0 24 24" width="22" height="22">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Get Started with Google</span>
            </button>
            
            <p className="hero-disclaimer">Free to start. No credit card required.</p>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="how-it-works-section">
          <h2 className="section-title">How StreamMind Works</h2>
          <p className="section-subtitle">A seamless workflow from raw file to global delivery</p>
          
          <div className="steps-container">
            <div className="step-card glass-panel">
              <div className="step-icon-wrapper blue">
                <UploadCloud size={28} />
              </div>
              <h3 className="step-title">1. Secure Upload</h3>
              <p className="step-desc">Upload your raw video files securely directly to our robust cloud storage infrastructure.</p>
            </div>
            
            <div className="step-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>

            <div className="step-card glass-panel">
              <div className="step-icon-wrapper purple">
                <Cpu size={28} />
              </div>
              <h3 className="step-title">2. AI Processing</h3>
              <p className="step-desc">Our distributed engine automatically transcodes formats, generates subtitles, and analyzes content.</p>
            </div>
            
            <div className="step-arrow">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </div>

            <div className="step-card glass-panel">
              <div className="step-icon-wrapper green">
                <Globe size={28} />
              </div>
              <h3 className="step-title">3. Global Streaming</h3>
              <p className="step-desc">Your videos are delivered worldwide with ultra-low latency via our optimized CDN network.</p>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="features-section">
          <h2 className="section-title">Enterprise-Grade Features</h2>
          
          <div className="features-grid">
            <div className="feature-item">
              <div className="feature-icon">
                <Zap size={24} />
              </div>
              <div>
                <h4 className="feature-title">Auto-Transcoding</h4>
                <p className="feature-desc">Dynamically convert videos to HLS format with multiple quality tiers (1080p, 720p, 480p) for adaptive bitrate streaming.</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Sparkles size={24} />
              </div>
              <div>
                <h4 className="feature-title">Smart Subtitles</h4>
                <p className="feature-desc">AI-generated captions powered by advanced speech-to-text models, automatically synced to your video timeline.</p>
              </div>
            </div>

            <div className="feature-item">
              <div className="feature-icon">
                <Shield size={24} />
              </div>
              <div>
                <h4 className="feature-title">Content Moderation</h4>
                <p className="feature-desc">Automated scanning of all uploaded content to ensure compliance and safety across your platform.</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <PlayCircle size={20} />
            <span>StreamMind</span>
          </div>
          <p className="footer-copyright">&copy; {new Date().getFullYear()} StreamMind Platform. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
