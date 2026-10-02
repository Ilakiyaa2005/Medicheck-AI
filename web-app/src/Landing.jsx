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
      <text x="210" y="85" textAnchor="middle" fill="white" fontSize="11" fontWeight="700" fontFamily="monospace">ANOMALOUS ✗</text>

      {/* Scan beam */}
      <line x1="0" y1="80" x2="300" y2="80" stroke="#00c8ff" strokeWidth="0.5" strokeDasharray="4 4" opacity="0.4"/>

      {/* Labels */}
      <text x="90" y="125" textAnchor="middle" fill="#00ff88" fontSize="9" fontFamily="monospace">SPECTRAL MATCH</text>
      <text x="210" y="125" textAnchor="middle" fill="#ff2d55" fontSize="9" fontFamily="monospace">OPTICAL DEVIATION</text>
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
            <a href="#features" className="l-link">Capabilities</a>
            <a href="#how" className="l-link">Workflow</a>
            <a href="#tech" className="l-link">Technology</a>
          </div>
          <button className="l-cta-sm" onClick={onEnter}>Launch App →</button>
        </div>
      </nav>

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="hero-badge">
          <span className="hero-badge-dot" />
          Explainable AI · 100% On-Device Privacy · Zero Database
        </div>
        <h1 className="hero-h1">
          Detect Counterfeit<br />
          <span className="hero-gradient">Pharmaceuticals</span><br />
          Through Optical ML
        </h1>
        <p className="hero-sub">
          SpectraAuth uses calibrated <strong>Isolation Forest anomaly detection</strong>,
          17 optical and spectral features, live camera quality gates, and packaging OCR
          to screen medicines — with zero server-side data retention.
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
              <div className="hvf-score ok">Confidence: 94% · GENUINE</div>
              <div className="hvf-score bad">Z-Score Deviation: +3.2σ · ANOMALOUS</div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats ────────────────────────────────────────────────────────── */}
      <section className="stats-section">
        <Counter end={17}  suffix=""    label="Optical & Spectral Features" />
        <Counter end={94}  suffix="%"   label="Unseen Batch Retention (CV)" />
        <Counter end={200} suffix=""    label="Isolation Trees per Model" />
        <Counter end={0}   suffix=" B"  label="Server Data Stored (Zero Logs)" />
      </section>

      {/* ── Features ─────────────────────────────────────────────────────── */}
      <section className="section" id="features">
        <div className="section-label">◈ CAPABILITIES</div>
        <h2 className="section-h2">Everything You Need to <span className="hl">Screen</span> Medicines</h2>
        <div className="feat-grid">
          <FeatureCard icon="🔬" delay="0s"    title="17-Feature Optical Analysis" desc="Extracts RGB means, colour ratios, normalized HSV values, GLCM texture (Contrast, Homogeneity), surface glossiness, and specular reflection." />
          <FeatureCard icon="🧠" delay="0.1s"  title="Isolation Forest Anomaly Detection" desc="Trained strictly on verified genuine tablets across 12 production batches. Anomalous chemical coatings or color deviations are reliably isolated." />
          <FeatureCard icon="📊" delay="0.2s"  title="Explainable AI Diagnostics" desc="Interactive z-score bar chart and plain-English diagnostic explanations showing exactly which features contributed to the verdict." />
          <FeatureCard icon="📷" delay="0.3s"  title="Live Camera Quality Gate" desc="Real-time browser CV monitors brightness, focus blur, specular glare, motion, and framing before capture to prevent poor-quality scans." />
          <FeatureCard icon="📦" delay="0.4s"  title="Label OCR & Expiry Check" desc="Extracts Indian blister pack batch numbers, parses GS1 Datamatrix 2D codes, and enforces strict pharmaceutical end-of-month expiry rules." />
          <FeatureCard icon="🔒" delay="0.5s"  title="100% On-Device Privacy" desc="Zero logins, zero accounts, and zero cloud database. All scan history, thumbnails, and notes reside strictly inside your browser's localStorage." />
        </div>
      </section>

      {/* ── How it works ─────────────────────────────────────────────────── */}
      <section className="section how-section" id="how">
        <div className="section-label">◈ WORKFLOW</div>
        <h2 className="section-h2">How <span className="hl">SpectraAuth</span> Works</h2>
        <div className="steps-wrap">
          <Step num="01" color="#00c8ff" title="Guided Live Capture"
            desc="Use your smartphone or webcam with the live viewfinder. Visual indicators ensure lighting, blur, and tablet distance meet quality standards before capture." />
          <Step num="02" color="#00ff88" title="Server Quality & CLAHE Normalization"
            desc="The image is validated on the backend for blur and glare, then resized to 224×224 with CLAHE contrast enhancement for illumination invariance." />
          <Step num="03" color="#a78bfa" title="17-Feature Spectral Extraction"
            desc="Extracts color means, HSV coordinates, channel ratios, GLCM texture metrics, intensity statistics, surface glossiness, and specular reflection." />
          <Step num="04" color="#fb923c" title="Condition Model Routing"
            desc="Requests are dynamically routed to condition-specific models (Flash ON vs Flash OFF) with calibrated decision thresholds to eliminate lighting bias." />
          <Step num="05" color="#00ff88" title="Calibrated Verdict & Explanation"
            desc="Get a calibrated confidence score, plain-English reasons for the verdict, and a diverging z-score chart highlighting feature anomalies." />
        </div>
      </section>

      {/* ── Tech stack ───────────────────────────────────────────────────── */}
      <section className="section tech-section" id="tech">
        <div className="section-label">◈ TECHNOLOGY STACK</div>
        <h2 className="section-h2">Built With <span className="hl">Scientific Tools</span></h2>
        <div className="tech-grid">
          {[
            { name: "Python 3.10+",        role: "Backend Runtime",     color: "#ffd43b" },
            { name: "Isolation Forest",    role: "Anomaly Detection",   color: "#00ff88" },
            { name: "OpenCV",              role: "Computer Vision",     color: "#00c8ff" },
            { name: "Scikit-learn",        role: "ML & Preprocessing",   color: "#f97316" },
            { name: "scikit-image",        role: "GLCM Texture Analysis",color: "#a78bfa" },
            { name: "Flask (Stateless)",   role: "Zero-DB REST API",    color: "#00c8ff" },
            { name: "React 18 + Vite",     role: "Modern Frontend",     color: "#61dafb" },
            { name: "Tesseract.js & ZXing",role: "OCR & GS1 QR Barcodes",color: "#ffffff" },
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
        <h2 className="cta-h2">Screen Your Tablet in 15 Seconds</h2>
        <p className="cta-sub">No account needed. Instant on-device screening with full privacy.</p>
        <button className="hero-btn-primary cta-btn" onClick={onEnter}>
          <span className="hero-btn-icon">🔬</span>
          Open SpectraAuth Scanner
        </button>
      </section>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <footer className="l-footer">
        <div className="l-footer-logo">⬡ SPECTRAAUTH · MEDICHECK-AI</div>
        <p>Computational Optical Screening System for Pharmaceutical Authentication</p>
        <p style={{ marginTop: "6px", fontSize: "0.8rem", color: "var(--text-muted, #64748b)" }}>
          ⚠️ Research & screening tool. Not a substitute for laboratory HPLC spectrometry or clinical regulatory assay.
        </p>
      </footer>
    </div>
  );
}
