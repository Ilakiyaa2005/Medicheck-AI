import { useEffect, useRef, useState } from "react";
import "./Landing.css";

/* ── particle canvas ─────────────────────────────────────────────────────── */
function ParticleCanvas() {
  const ref = useRef();
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas.getContext("2d");
    let W, H, particles, raf;
    const resize = () => {
      W = canvas.width  = canvas.offsetWidth;
      H = canvas.height = canvas.offsetHeight;
    };
    resize();
    window.addEventListener("resize", resize);

    particles = Array.from({ length: 90 }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      r: Math.random() * 1.6 + 0.4,
      dx: (Math.random() - 0.5) * 0.25,
      dy: (Math.random() - 0.5) * 0.25,
      a: Math.random(),
    }));

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      particles.forEach(p => {
        p.x += p.dx; p.y += p.dy;
        if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
        if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0,200,255,${p.a * 0.6})`;
        ctx.fill();
      });
      // draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const d  = Math.sqrt(dx * dx + dy * dy);
          if (d < 110) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(0,200,255,${(1 - d / 110) * 0.12})`;
            ctx.lineWidth = 0.6;
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); };
  }, []);
  return <canvas ref={ref} className="particle-canvas" />;
}

/* ── Animated counter ────────────────────────────────────────────────────── */
function Counter({ end, suffix = "", label }) {
  const [val, setVal] = useState(0);
  const ref = useRef();
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      obs.disconnect();
      let start = 0;
      const step = end / 60;
      const tick = () => {
        start = Math.min(start + step, end);
        setVal(Math.round(start));
        if (start < end) requestAnimationFrame(tick);
      };
      tick();
    }, { threshold: 0.5 });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end]);
  return (
    <div className="counter-card" ref={ref}>
      <div className="counter-num">{val}{suffix}</div>
      <div className="counter-label">{label}</div>
    </div>
  );
}

/* ── Feature card ────────────────────────────────────────────────────────── */
function FeatureCard({ icon, title, desc, delay }) {
  return (
    <div className="feat-card" style={{ animationDelay: delay }}>
      <div className="feat-card-icon">{icon}</div>
      <h3 className="feat-card-title">{title}</h3>
      <p className="feat-card-desc">{desc}</p>
    </div>
  );
}

/* ── How it works step ───────────────────────────────────────────────────── */
function Step({ num, title, desc, color }) {
  return (
    <div className="step">
      <div className="step-num" style={{ color, borderColor: color, boxShadow: `0 0 18px ${color}40` }}>{num}</div>
      <div className="step-connector" />
      <div className="step-content">
        <h4 className="step-title">{title}</h4>
        <p className="step-desc">{desc}</p>
      </div>
    </div>
  );
}

/* ── Pill 3D mockup SVG ──────────────────────────────────────────────────── */
function PillMockup() {
  return (
    <svg viewBox="0 0 300 160" className="pill-svg" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="pg1" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#00ff88" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#00c8ff" stopOpacity="0.7"/>
        </linearGradient>
        <linearGradient id="pg2" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ff2d55" stopOpacity="0.8"/>
          <stop offset="100%" stopColor="#ff6b35" stopOpacity="0.6"/>
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur"/>
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>
      {/* Genuine pill */}
      <ellipse cx="90" cy="80" rx="65" ry="28" fill="url(#pg1)" filter="url(#glow)" opacity="0.9"/>
      <ellipse cx="90" cy="74" rx="58" ry="14" fill="rgba(255,255,255,0.15)"/>
      <text x="90" y="85" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">GENUINE ✓</text>

      {/* Fake pill */}
      <ellipse cx="210" cy="80" rx="65" ry="28" fill="url(#pg2)" filter="url(#glow)" opacity="0.85"/>
      <ellipse cx="210" cy="74" rx="58" ry="14" fill="rgba(255,255,255,0.1)"/>
      <text x="210" y="85" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">FAKE ✗</text>

      {/* Scan beam */}
      <line x1="0" y1="80" x2="300" y2="80" stroke="#00c8ff" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.4"/>

      {/* Labels */}
      <text x="90" y="125" textAnchor="middle" fill="#00ff88" fontSize="9" fontFamily="monospace">SPECTRAL MATCH</text>
      <text x="210" y="125" textAnchor="middle" fill="#ff2d55" fontSize="9" fontFamily="monospace">ANOMALY DETECTED</text>
    </svg>
  );
}

/* ── MAIN LANDING PAGE ───────────────────────────────────────────────────── */
export default function Landing({ onEnter }) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing">
      <ParticleCanvas />

      {/* ── Nav ──────────────────────────────────────────────────────────── */}
      <nav className={`l-nav ${scrolled ? "l-nav-solid" : ""}`}>
        <div className="l-nav-inner">
          <div className="l-logo">
            <div className="l-logo-icon">⬡</div>
            <span>SPECTRAAUTH</span>
          </div>
          <div className="l-nav-links">
            <a href="#features" className="l-link">Features</a>
            <a href="#how" className="l-link">How It Works</a>
            <a href="#tech" className="l-link">Technology</a>
          </div>
          <button className="l-cta-sm" onClick={onEnter}>Launch App →</button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          AI-Powered · No Lab Equipment Required
        </div>
        <h1 className="hero-h1">
          Detect Counterfeit<br />
          <span className="hero-gradient">Pharmaceuticals</span><br />
          Instantly
        </h1>
        <p className="hero-sub">
          SpectraAuth uses advanced <strong>Isolation Forest anomaly detection</strong> and
          RGB spectral analysis from smartphone images to authenticate medicines in real-time —
          no hardware, no laboratory, no fake data needed.
        </p>
        <div className="hero-actions">
          <button className="hero-btn-primary" onClick={onEnter}>
            <span className="hero-btn-icon">🔬</span>
            Start Authenticating
          </button>
          <a href="#how" className="hero-btn-ghost">See How It Works ↓</a>
        </div>

        {/* Floating pill mockup */}
        <div className="hero-visual">
          <div className="hero-visual-glow" />
          <div className="hero-visual-frame">
            <div className="hvf-label">SPECTRAL ANALYSIS ACTIVE</div>
            <PillMockup />
            <div className="hvf-scores">
              <div className="hvf-score ok">Confidence: 94.2% · GENUINE</div>
              <div className="hvf-score bad">Anomaly Score: −0.312 · FAKE</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="stats-section">
        <Counter end={17}  suffix="+"  label="Spectral Features Extracted" />
        <Counter end={95}  suffix="%"  label="Detection Accuracy (Genuine Data)" />
        <Counter end={200} suffix=""   label="Isolation Trees in Model" />
        <Counter end={0}   suffix=" kg" label="Hardware Required" />
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="section" id="features">
        <div className="section-label">◈ CAPABILITIES</div>
        <h2 className="section-h2">Everything You Need to <span className="hl">Authenticate</span> Medicines</h2>
        <div className="feat-grid">
          <FeatureCard icon="🔬" delay="0s"    title="Spectral RGB Analysis"     desc="Extracts 17 optical features including RGB means, ratios, HSV values, texture and surface gloss from any smartphone image." />
          <FeatureCard icon="🧠" delay="0.1s"  title="Isolation Forest AI"       desc="Trained exclusively on genuine tablet data. Deviations from the learned pattern are automatically flagged as counterfeit." />
          <FeatureCard icon="⚡" delay="0.2s"  title="Real-Time Detection"        desc="Upload an image and receive a result with confidence score and anomaly metrics in under 2 seconds." />
          <FeatureCard icon="📱" delay="0.3s"  title="Mobile Ready"              desc="Full React Native app with camera capture, gallery picker, and haptic feedback — works on iOS and Android." />
          <FeatureCard icon="📊" delay="0.4s"  title="Analytics Dashboard"       desc="Track detection history, monitor genuine vs. fake ratios, view feature distributions across all scans." />
          <FeatureCard icon="🔒" delay="0.5s"  title="No Internet Required"      desc="Deploy locally. All computation happens on your machine — patient data and medicine information never leaves your network." />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="section how-section" id="how">
        <div className="section-label">◈ WORKFLOW</div>
        <h2 className="section-h2">How <span className="hl">SpectraAuth</span> Works</h2>
        <div className="steps-wrap">
          <Step num="01" color="#00c8ff" title="Capture Tablet Image"
            desc="Use your smartphone camera or upload any existing photo. SpectraAuth works with standard JPEG, PNG, or WEBP images." />
          <Step num="02" color="#00ff88" title="OpenCV Preprocessing"
            desc="Image is resized to 224×224, denoised with Gaussian blur, and lighting is normalised using CLAHE — ensuring consistent feature extraction." />
          <Step num="03" color="#a78bfa" title="17-Feature Extraction"
            desc="RGB means, HSV values, colour ratios, GLCM texture (Contrast, Homogeneity), intensity statistics, Glossiness and Specular Ratio are extracted." />
          <Step num="04" color="#fb923c" title="Isolation Forest Scoring"
            desc="The feature vector is scaled and passed to the Isolation Forest model. Samples deviating from genuine patterns receive a negative decision score." />
          <Step num="05" color="#00ff88" title="Result & Confidence"
            desc="Receive Genuine (+1) or Fake (−1) with a confidence percentage, anomaly score, and extracted feature breakdown — all in under 2 seconds." />
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────────────────────── */}
      <section className="section tech-section" id="tech">
        <div className="section-label">◈ TECHNOLOGY STACK</div>
        <h2 className="section-h2">Built With <span className="hl">Proven Tools</span></h2>
        <div className="tech-grid">
          {[
            { name: "Python 3.11",         role: "Core Language",       color: "#ffd43b" },
            { name: "Isolation Forest",     role: "Anomaly Detection",   color: "#00ff88" },
            { name: "OpenCV",              role: "Image Processing",     color: "#00c8ff" },
            { name: "Scikit-learn",        role: "Machine Learning",     color: "#f97316" },
            { name: "scikit-image",        role: "GLCM Texture",         color: "#a78bfa" },
            { name: "Flask + CORS",        role: "REST API",             color: "#00c8ff" },
            { name: "React 18",            role: "Web Frontend",         color: "#61dafb" },
            { name: "React Native / Expo", role: "Mobile App",           color: "#ffffff" },
          ].map(t => (
            <div key={t.name} className="tech-chip">
              <div className="tech-dot" style={{ background: t.color }} />
              <div>
                <div className="tech-name" style={{ color: t.color }}>{t.name}</div>
                <div className="tech-role">{t.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="cta-section">
        <div className="cta-glow" />
        <div className="cta-label">◈ READY TO BEGIN</div>
        <h2 className="cta-h2">Authenticate Your First Tablet in 30 Seconds</h2>
        <p className="cta-sub">No setup needed. Upload an image, get a result.</p>
        <button className="hero-btn-primary cta-btn" onClick={onEnter}>
          <span className="hero-btn-icon">🔬</span>
          Open SpectraAuth Scanner
        </button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="l-footer">
        <div className="l-footer-logo">⬡ SPECTRAAUTH</div>
        <p>Hardware-Free Computational Spectral Authentication System for Pharmaceuticals</p>
        <p>Final Year Project · Isolation Forest · Anomaly Detection</p>
      </footer>
    </div>
  );
}
