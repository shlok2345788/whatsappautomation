import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

const Landing = () => {
  return (
    <div style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", WebkitFontSmoothing: 'antialiased' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');

        .lp * { box-sizing: border-box; margin: 0; padding: 0; }

        .lp {
          --green: #16a34a;
          --green-light: #22c55e;
          --green-tint: #f0fdf4;
          --green-border: #bbf7d0;
          --text-primary: #111827;
          --text-secondary: #4b5563;
          --text-muted: #9ca3af;
          --bg: #f8fafc;
          --surface: #ffffff;
          --border: #e2e8f0;
          --border-soft: #f1f5f9;
          color: var(--text-primary);
          background: var(--bg);
          line-height: 1.6;
          font-size: 15px;
        }

        /* NAV */
        .lp-nav {
          position: sticky; top: 0; z-index: 100;
          background: rgba(255,255,255,0.96);
          backdrop-filter: blur(8px);
          border-bottom: 1px solid var(--border);
        }
        .lp-nav-inner {
          max-width: 1160px; margin: 0 auto; padding: 0 24px;
          height: 60px; display: flex; align-items: center; justify-content: space-between;
        }
        .lp-brand { font-size: 15px; font-weight: 700; color: var(--text-primary); letter-spacing: -0.2px; }
        .lp-nav-links { display: flex; align-items: center; gap: 32px; list-style: none; }
        .lp-nav-links a { font-size: 14px; color: var(--text-secondary); font-weight: 500; text-decoration: none; transition: color 0.15s; }
        .lp-nav-links a:hover { color: var(--text-primary); }
        .lp-nav-actions { display: flex; align-items: center; gap: 12px; }

        .lp-btn-ghost {
          font-size: 14px; font-weight: 500; color: var(--text-secondary);
          padding: 7px 14px; border-radius: 7px; cursor: pointer;
          border: none; background: none; text-decoration: none; display: inline-block;
          transition: color 0.15s, background 0.15s;
        }
        .lp-btn-ghost:hover { color: var(--text-primary); background: var(--bg); }

        .lp-btn-primary {
          font-size: 14px; font-weight: 600; color: #fff; background: var(--green);
          border: none; padding: 8px 18px; border-radius: 7px; cursor: pointer;
          text-decoration: none; display: inline-flex; align-items: center; gap: 6px;
          transition: background 0.15s, transform 0.1s;
        }
        .lp-btn-primary:hover { background: #15803d; transform: translateY(-1px); }

        /* SECTIONS */
        .lp section { padding: 96px 24px; }
        .lp-container { max-width: 1160px; margin: 0 auto; }

        .lp-eyebrow {
          display: inline-block; font-size: 11.5px; font-weight: 700;
          letter-spacing: 1.2px; text-transform: uppercase; color: var(--green); margin-bottom: 16px;
        }

        .lp-h2 {
          font-size: clamp(28px, 4vw, 42px); font-weight: 800; color: var(--text-primary);
          line-height: 1.2; letter-spacing: -0.8px;
        }

        .lp-sub {
          font-size: 17px; color: var(--text-secondary); line-height: 1.7;
          max-width: 520px; margin-top: 14px;
        }

        /* HERO */
        .lp-hero { padding: 100px 24px 80px; background: var(--surface); }
        .lp-hero-inner {
          max-width: 1160px; margin: 0 auto;
          display: grid; grid-template-columns: 1fr 1fr; gap: 64px; align-items: center;
        }
        .lp-hero-h1 {
          font-size: clamp(36px, 5vw, 56px); font-weight: 900;
          letter-spacing: -1.5px; line-height: 1.08; color: var(--text-primary); margin-bottom: 20px;
        }
        .lp-hero-h1 em { font-style: normal; color: var(--green); }
        .lp-hero-sub { font-size: 18px; color: var(--text-secondary); line-height: 1.65; margin-bottom: 36px; max-width: 440px; }
        .lp-hero-actions { display: flex; gap: 12px; flex-wrap: wrap; }

        .lp-btn-hero-primary {
          background: var(--green); color: #fff; padding: 13px 26px; border-radius: 9px;
          font-size: 15px; font-weight: 700; border: none; cursor: pointer;
          display: inline-flex; align-items: center; gap: 8px; text-decoration: none;
          transition: background 0.15s, transform 0.1s;
        }
        .lp-btn-hero-primary:hover { background: #15803d; transform: translateY(-1px); }

        .lp-btn-hero-secondary {
          background: transparent; color: var(--text-primary); padding: 13px 24px;
          border-radius: 9px; font-size: 15px; font-weight: 600;
          border: 1.5px solid var(--border); cursor: pointer; text-decoration: none;
          display: inline-block; transition: border-color 0.15s, background 0.15s;
        }
        .lp-btn-hero-secondary:hover { border-color: #94a3b8; background: var(--bg); }

        /* PRODUCT CARD */
        .lp-product-card {
          background: var(--surface); border: 1px solid var(--border); border-radius: 16px;
          overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,0.06), 0 1px 4px rgba(0,0,0,0.04);
        }
        .lp-card-header {
          background: #f8fafc; border-bottom: 1px solid var(--border);
          padding: 13px 18px; display: flex; align-items: center; justify-content: space-between;
        }
        .lp-card-title { font-size: 13px; font-weight: 700; color: var(--text-primary); }
        .lp-ws-badge { display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--green); }
        .lp-ws-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--green); animation: lp-pulse 2s infinite; }
        @keyframes lp-pulse { 0%,100%{opacity:1} 50%{opacity:.4} }

        .lp-send-row {
          padding: 14px 18px; border-bottom: 1px solid var(--border-soft);
          display: flex; align-items: center; justify-content: space-between;
        }
        .lp-send-row:last-of-type { border-bottom: none; }
        .lp-send-person { font-size: 13px; font-weight: 700; color: var(--text-primary); margin-bottom: 2px; }
        .lp-send-file { font-size: 12px; color: var(--text-muted); }
        .lp-send-phone { font-size: 11.5px; color: var(--text-muted); margin-top: 2px; font-family: monospace; }

        .lp-badge-sent { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--green);background:var(--green-tint);border:1px solid var(--green-border);padding:4px 10px;border-radius:20px;white-space:nowrap; }
        .lp-badge-sending { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#b45309;background:#fffbeb;border:1px solid #fde68a;padding:4px 10px;border-radius:20px;white-space:nowrap; }
        .lp-badge-pending { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;color:#6b7280;background:#f3f4f6;border:1px solid #e5e7eb;padding:4px 10px;border-radius:20px;white-space:nowrap; }
        .lp-sending-dot { width:6px;height:6px;border-radius:50%;background:#d97706;animation:lp-pulse 1.2s infinite; }

        .lp-progress-wrap { padding:12px 18px;background:#fafafa;border-top:1px solid var(--border); }
        .lp-progress-label { display:flex;justify-content:space-between;font-size:12px;color:var(--text-muted);margin-bottom:6px; }
        .lp-progress-track { height:5px;background:#e5e7eb;border-radius:99px;overflow:hidden; }
        .lp-progress-fill { height:100%;width:64%;background:var(--green);border-radius:99px;animation:lp-prog 3s ease-in-out infinite alternate; }
        @keyframes lp-prog { from{width:55%} to{width:74%} }

        /* IMPACT */
        .lp-impact { background: var(--bg); }
        .lp-impact-h { font-size:clamp(32px,4.5vw,50px);font-weight:900;letter-spacing:-1.2px;line-height:1.1;color:var(--text-primary);margin-bottom:60px;text-align:center; }
        .lp-impact-h span { color: var(--green); }

        .lp-workflows { display:grid;grid-template-columns:1fr auto 1fr;gap:32px;align-items:start;max-width:820px;margin:0 auto; }
        .lp-wf-col { background:var(--surface);border:1px solid var(--border);border-radius:16px;overflow:hidden; }
        .lp-wf-head { padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:10px; }
        .lp-wf-head.bad { background:#fef2f2; }
        .lp-wf-head.good { background:var(--green-tint); }
        .lp-wf-label { font-size:12px;font-weight:700;letter-spacing:.8px;text-transform:uppercase; }
        .lp-wf-label.bad { color:#dc2626; }
        .lp-wf-label.good { color:var(--green); }
        .lp-wf-step { padding:11px 20px;font-size:13.5px;color:var(--text-secondary);display:flex;align-items:center;gap:10px;border-bottom:1px solid var(--border-soft); }
        .lp-wf-step:last-child { border-bottom:none; }
        .lp-step-num { width:22px;height:22px;border-radius:50%;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .lp-step-num.bad { background:#fee2e2;color:#dc2626; }
        .lp-step-num.good { background:var(--green-tint);color:var(--green); }
        .lp-vs { display:flex;flex-direction:column;align-items:center;justify-content:center;padding-top:48px;gap:6px; }
        .lp-vs-text { font-size:11px;font-weight:800;color:#9ca3af;letter-spacing:1px;text-transform:uppercase; }
        .lp-vs-arrow { font-size:24px;color:var(--green); }

        /* FEATURES */
        .lp-features { background:var(--surface); }
        .lp-features-hdr { text-align:center;max-width:600px;margin:0 auto 56px; }
        .lp-features-grid { display:grid;grid-template-columns:1.5fr 1fr 1fr;grid-template-rows:auto auto;gap:20px; }
        .lp-feat-card { background:var(--bg);border:1px solid var(--border);border-radius:16px;padding:28px;transition:border-color .2s,box-shadow .2s; }
        .lp-feat-card:hover { border-color:#94a3b8;box-shadow:0 4px 20px rgba(0,0,0,.05); }
        .lp-feat-card.large { grid-row:span 2;padding:36px;background:var(--surface);border-color:var(--green-border); }
        .lp-feat-icon { width:38px;height:38px;border-radius:9px;background:var(--green-tint);display:flex;align-items:center;justify-content:center;margin-bottom:16px;color:var(--green);font-size:18px; }
        .lp-feat-title { font-size:15px;font-weight:700;color:var(--text-primary);margin-bottom:8px;letter-spacing:-.2px; }
        .lp-feat-desc { font-size:13.5px;color:var(--text-secondary);line-height:1.6; }
        .lp-feat-card.large .lp-feat-title { font-size:18px;margin-bottom:10px; }
        .lp-feat-card.large .lp-feat-desc { font-size:14.5px;line-height:1.7; }
        .lp-feat-demo { margin-top:24px;background:var(--bg);border:1px solid var(--border);border-radius:10px;padding:14px 16px; }
        .lp-demo-row { display:flex;align-items:center;justify-content:space-between;padding:9px 0;border-bottom:1px solid var(--border-soft);font-size:12.5px; }
        .lp-demo-row:last-child { border-bottom:none; }
        .lp-demo-name { font-weight:600;color:var(--text-primary); }
        .lp-demo-file { color:var(--text-muted); }

        /* HOW IT WORKS */
        .lp-hiw { background:var(--bg); }
        .lp-steps { display:grid;grid-template-columns:repeat(4,1fr);gap:20px; }
        .lp-step { padding:36px 28px;background:var(--surface);border:1px solid var(--border);border-radius:16px; }
        .lp-step-num-big { font-size:52px;font-weight:900;color:var(--green-tint);line-height:1;margin-bottom:20px;letter-spacing:-3px;border-bottom:2px solid var(--green-border);padding-bottom:16px; }
        .lp-step-num-big span { color:var(--green);opacity:.3; }
        .lp-step-title { font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px;letter-spacing:-.3px; }
        .lp-step-desc { font-size:13.5px;color:var(--text-secondary);line-height:1.6; }

        /* DASHBOARD MOCKUP */
        .lp-preview { background:var(--surface); }
        .lp-preview-hdr { text-align:center;margin-bottom:52px; }
        .lp-dashboard { background:var(--surface);border:1px solid var(--border);border-radius:18px;overflow:hidden;box-shadow:0 8px 48px rgba(0,0,0,.08),0 2px 8px rgba(0,0,0,.04); }
        .lp-dash-topbar { background:#0f172a;padding:13px 20px;display:flex;align-items:center;gap:8px; }
        .lp-topbar-dot { width:11px;height:11px;border-radius:50%; }
        .lp-dash-body { display:grid;grid-template-columns:200px 1fr; }
        .lp-dash-sidebar { background:#0f172a;padding:16px 10px;min-height:380px;display:flex;flex-direction:column;gap:2px; }
        .lp-dash-nav { padding:9px 12px;border-radius:7px;font-size:12.5px;color:#94a3b8;display:flex;align-items:center;gap:9px;font-weight:500; }
        .lp-dash-nav.active { background:#1e293b;color:#fff;font-weight:600; }
        .lp-nav-dot { width:6px;height:6px;border-radius:50%;background:#475569;flex-shrink:0; }
        .lp-dash-nav.active .lp-nav-dot { background:var(--green); }
        .lp-dash-main { padding:24px;background:var(--bg); }
        .lp-dash-ptitle { font-size:17px;font-weight:700;color:var(--text-primary);margin-bottom:20px;letter-spacing:-.3px; }
        .lp-dash-stats { display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px; }
        .lp-stat { background:var(--surface);border:1px solid var(--border);border-radius:9px;padding:14px 16px; }
        .lp-stat-label { font-size:10.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.7px;margin-bottom:6px; }
        .lp-stat-val { font-size:22px;font-weight:800;color:var(--text-primary);letter-spacing:-.5px; }
        .lp-stat-sub { font-size:11px;color:var(--green);font-weight:600;margin-top:3px; }
        .lp-dash-table { background:var(--surface);border:1px solid var(--border);border-radius:9px;overflow:hidden; }
        .lp-table-head { display:grid;grid-template-columns:2fr 2fr 1.5fr 1fr 1fr;background:#f8fafc;border-bottom:1px solid var(--border);padding:10px 16px; }
        .lp-col-head { font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px; }
        .lp-table-row { display:grid;grid-template-columns:2fr 2fr 1.5fr 1fr 1fr;padding:12px 16px;border-bottom:1px solid var(--border-soft);align-items:center; }
        .lp-table-row:last-child { border-bottom:none; }
        .lp-cell { font-size:12.5px;color:var(--text-secondary); }
        .lp-cell.bold { font-weight:600;color:var(--text-primary); }

        /* MULTI-COMPANY */
        .lp-mc { background:var(--bg); }
        .lp-mc-inner { max-width:1160px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center; }
        .lp-co-cards { display:flex;flex-direction:column;gap:20px; }
        .lp-co-card { background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:22px 24px;display:flex;align-items:center;gap:20px;transition:border-color .2s; }
        .lp-co-card:hover { border-color:var(--green-border); }
        .lp-co-init { width:44px;height:44px;border-radius:10px;background:var(--green-tint);color:var(--green);font-size:18px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0; }
        .lp-co-init.b { background:#eff6ff;color:#2563eb; }
        .lp-co-name { font-size:14px;font-weight:700;color:var(--text-primary);margin-bottom:3px; }
        .lp-co-detail { font-size:12.5px;color:var(--text-muted); }
        .lp-co-badge { display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:4px 10px;border-radius:20px; }
        .lp-co-badge.connected { background:var(--green-tint);color:var(--green);border:1px solid var(--green-border); }
        .lp-co-badge.ready { background:#eff6ff;color:#2563eb;border:1px solid #bfdbfe; }

        /* PIPELINE */
        .lp-pipeline { background:var(--green-tint);border-top:1px solid var(--green-border);border-bottom:1px solid var(--green-border); }
        .lp-pipeline-inner { max-width:1160px;margin:0 auto;text-align:center; }
        .lp-pipeline-steps { display:flex;align-items:center;justify-content:center;gap:0;margin-top:52px;flex-wrap:wrap; }
        .lp-pipe-step { display:flex;flex-direction:column;align-items:center;gap:10px; }
        .lp-pipe-node { width:72px;height:72px;border-radius:50%;background:var(--surface);border:2px solid var(--green-border);display:flex;align-items:center;justify-content:center;font-size:22px;box-shadow:0 2px 12px rgba(22,163,74,.08);transition:border-color .2s,box-shadow .2s; }
        .lp-pipe-node:hover { border-color:var(--green);box-shadow:0 4px 20px rgba(22,163,74,.15); }
        .lp-pipe-label { font-size:12.5px;font-weight:700;color:var(--text-primary); }
        .lp-pipe-arrow { width:60px;height:2px;background:var(--green-border);position:relative;margin-bottom:32px;flex-shrink:0; }
        .lp-pipe-arrow::after { content:'';position:absolute;right:-5px;top:-4px;width:0;height:0;border-left:8px solid var(--green-border);border-top:5px solid transparent;border-bottom:5px solid transparent; }

        /* CTA */
        .lp-cta { background:var(--surface); }
        .lp-cta-inner { max-width:620px;margin:0 auto;text-align:center; }
        .lp-cta-h { font-size:clamp(30px,4vw,44px);font-weight:900;letter-spacing:-1.2px;line-height:1.1;color:var(--text-primary);margin-bottom:16px; }
        .lp-cta-sub { font-size:17px;color:var(--text-secondary);line-height:1.65;margin-bottom:36px; }

        /* FAQ */
        .lp-faq { background:var(--bg); }
        .lp-faq-inner { max-width:720px;margin:0 auto; }
        .lp-faq-hdr { text-align:center;margin-bottom:48px; }
        .lp-faq-list { display:flex;flex-direction:column;gap:12px; }
        .lp details { background:var(--surface);border:1px solid var(--border);border-radius:10px;overflow:hidden;transition:border-color .2s; }
        .lp details:hover { border-color:#94a3b8; }
        .lp details[open] { border-color:var(--green-border); }
        .lp summary { list-style:none;padding:18px 22px;font-size:15px;font-weight:600;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:16px; }
        .lp summary::-webkit-details-marker { display:none; }
        .lp-faq-chevron { width:20px;height:20px;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:12px;color:var(--text-muted);transition:background .15s,transform .2s; }
        .lp details[open] .lp-faq-chevron { background:var(--green-tint);color:var(--green);transform:rotate(45deg); }
        .lp-faq-answer { padding:0 22px 18px;font-size:14px;color:var(--text-secondary);line-height:1.7; }

        /* FOOTER */
        .lp-footer { background:#0f172a;padding:56px 24px 32px; }
        .lp-footer-inner { max-width:1160px;margin:0 auto; }
        .lp-footer-top { display:grid;grid-template-columns:1fr 1fr 1fr;gap:40px;margin-bottom:48px; }
        .lp-footer-brand { font-size:15px;font-weight:700;color:#fff;margin-bottom:10px; }
        .lp-footer-desc { font-size:13px;color:#64748b;line-height:1.65;max-width:240px; }
        .lp-footer-col-title { font-size:11px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:1px;margin-bottom:16px; }
        .lp-footer-links { list-style:none;display:flex;flex-direction:column;gap:10px; }
        .lp-footer-links a { font-size:13.5px;color:#64748b;text-decoration:none;transition:color .15s; }
        .lp-footer-links a:hover { color:#94a3b8; }
        .lp-footer-bottom { border-top:1px solid #1e293b;padding-top:24px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px; }
        .lp-footer-copy { font-size:12.5px;color:#475569; }
        .lp-footer-legal { display:flex;gap:20px; }
        .lp-footer-legal a { font-size:12.5px;color:#475569;text-decoration:none;transition:color .15s; }
        .lp-footer-legal a:hover { color:#94a3b8; }

        /* RESPONSIVE */
        @media (max-width:900px) {
          .lp-hero-inner { grid-template-columns:1fr; }
          .lp-hero-visual { display:none; }
          .lp-workflows { grid-template-columns:1fr; }
          .lp-features-grid { grid-template-columns:1fr 1fr; }
          .lp-feat-card.large { grid-row:span 1;grid-column:span 2; }
          .lp-steps { grid-template-columns:1fr 1fr; }
          .lp-mc-inner { grid-template-columns:1fr; }
          .lp-footer-top { grid-template-columns:1fr 1fr; }
          .lp-dash-stats { grid-template-columns:1fr 1fr; }
        }
        @media (max-width:600px) {
          .lp section { padding:72px 20px; }
          .lp-nav-links { display:none; }
          .lp-features-grid { grid-template-columns:1fr; }
          .lp-feat-card.large { grid-column:span 1; }
          .lp-steps { grid-template-columns:1fr; }
          .lp-footer-top { grid-template-columns:1fr; }
          .lp-dash-body { grid-template-columns:1fr; }
          .lp-dash-sidebar { display:none; }
          .lp-dash-stats { grid-template-columns:1fr 1fr; }
        }
      `}</style>

      <div className="lp">

        {/* NAV */}
        <nav className="lp-nav">
          <div className="lp-nav-inner">
            <div className="lp-brand">WhatsApp PDF Automation</div>
            <ul className="lp-nav-links">
              <li><a href="#lp-features">Features</a></li>
              <li><a href="#lp-howitworks">How It Works</a></li>
              <li><a href="#lp-faq">FAQ</a></li>
            </ul>
            <div className="lp-nav-actions">
              <Link to="/signin" className="lp-btn-ghost">Sign In</Link>
              <Link to="/signup" className="lp-btn-primary">Get Started</Link>
            </div>
          </div>
        </nav>

        {/* HERO */}
        <section className="lp-hero">
          <div className="lp-hero-inner">
            <div>
              <span className="lp-eyebrow">WhatsApp Document Automation</span>
              <h1 className="lp-hero-h1">Send the right PDF to the <em>right person.</em></h1>
              <p className="lp-hero-sub">Match your Excel contact list with PDF documents and send them through WhatsApp — without manually searching for every number.</p>
              <div className="lp-hero-actions">
                <Link to="/signup" className="lp-btn-hero-primary">Get Started →</Link>
                <a href="#lp-howitworks" className="lp-btn-hero-secondary">See How It Works</a>
              </div>
            </div>

            <div className="lp-hero-visual">
              <div className="lp-product-card">
                <div className="lp-card-header">
                  <span className="lp-card-title">Send Queue</span>
                  <span className="lp-ws-badge"><span className="lp-ws-dot"></span> WhatsApp Connected</span>
                </div>
                <div className="lp-send-row">
                  <div>
                    <div className="lp-send-person">Shlok Lokhande</div>
                    <div className="lp-send-file">Shlok Lokhande.pdf</div>
                    <div className="lp-send-phone">+91 ••••• 7499</div>
                  </div>
                  <span className="lp-badge-sent">✓ Sent</span>
                </div>
                <div className="lp-send-row">
                  <div>
                    <div className="lp-send-person">Naman Shah</div>
                    <div className="lp-send-file">Naman Shah.pdf</div>
                    <div className="lp-send-phone">+91 ••••• 3210</div>
                  </div>
                  <span className="lp-badge-sending"><span className="lp-sending-dot"></span> Sending</span>
                </div>
                <div className="lp-send-row">
                  <div>
                    <div className="lp-send-person">Rahul Patil</div>
                    <div className="lp-send-file">Rahul Patil.pdf</div>
                    <div className="lp-send-phone">+91 ••••• 5688</div>
                  </div>
                  <span className="lp-badge-pending">Pending</span>
                </div>
                <div className="lp-send-row">
                  <div>
                    <div className="lp-send-person">Priya Sharma</div>
                    <div className="lp-send-file">Priya Sharma.pdf</div>
                    <div className="lp-send-phone">+91 ••••• 8821</div>
                  </div>
                  <span className="lp-badge-pending">Pending</span>
                </div>
                <div className="lp-progress-wrap">
                  <div className="lp-progress-label">
                    <span>Sending 2 of 194 documents</span>
                    <span style={{fontWeight:700, color:'var(--green)'}}>64%</span>
                  </div>
                  <div className="lp-progress-track"><div className="lp-progress-fill"></div></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* IMPACT */}
        <section className="lp-impact">
          <div className="lp-container" style={{textAlign:'center'}}>
            <h2 className="lp-impact-h">Stop sending documents <span>one by one.</span></h2>
            <div className="lp-workflows">
              <div className="lp-wf-col">
                <div className="lp-wf-head bad">
                  <span className="lp-wf-label bad">× Manual process</span>
                </div>
                <div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">1</span> Find contact in phone</div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">2</span> Open WhatsApp chat</div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">3</span> Search for the right PDF</div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">4</span> Attach and send</div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">5</span> Go back to contact list</div>
                  <div className="lp-wf-step"><span className="lp-step-num bad">6</span> Repeat for every person</div>
                </div>
              </div>
              <div className="lp-vs">
                <div className="lp-vs-text">vs</div>
                <div className="lp-vs-arrow">→</div>
              </div>
              <div className="lp-wf-col">
                <div className="lp-wf-head good">
                  <span className="lp-wf-label good">✓ Automated</span>
                </div>
                <div>
                  <div className="lp-wf-step"><span className="lp-step-num good">1</span> Upload Excel contacts</div>
                  <div className="lp-wf-step"><span className="lp-step-num good">2</span> Match PDFs automatically</div>
                  <div className="lp-wf-step"><span className="lp-step-num good">3</span> Review the queue</div>
                  <div className="lp-wf-step"><span className="lp-step-num good">4</span> Click Send</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURES */}
        <section className="lp-features" id="lp-features">
          <div className="lp-container">
            <div className="lp-features-hdr">
              <span className="lp-eyebrow">Features</span>
              <h2 className="lp-h2">Everything you need to automate document sending.</h2>
            </div>
            <div className="lp-features-grid">
              <div className="lp-feat-card large">
                <div className="lp-feat-icon">⊞</div>
                <div className="lp-feat-title">Excel Contact Matching</div>
                <div className="lp-feat-desc">Import names and mobile numbers from any Excel file. Automatic header detection and smart Indian number normalization — 9987527499, +91 prefix, and 0 prefix all resolve correctly.</div>
                <div className="lp-feat-demo">
                  <div className="lp-demo-row">
                    <span className="lp-demo-name">Shlok Lokhande</span>
                    <span className="lp-demo-file">919987527499</span>
                    <span className="lp-badge-sent" style={{fontSize:'11px',padding:'3px 8px'}}>Valid</span>
                  </div>
                  <div className="lp-demo-row">
                    <span className="lp-demo-name">Naman Shah</span>
                    <span className="lp-demo-file">919876543210</span>
                    <span className="lp-badge-sent" style={{fontSize:'11px',padding:'3px 8px'}}>Valid</span>
                  </div>
                  <div className="lp-demo-row">
                    <span className="lp-demo-name">Rahul Patil</span>
                    <span className="lp-demo-file">919820123456</span>
                    <span className="lp-badge-sent" style={{fontSize:'11px',padding:'3px 8px'}}>Valid</span>
                  </div>
                </div>
              </div>

              <div className="lp-feat-card">
                <div className="lp-feat-icon">⇄</div>
                <div className="lp-feat-title">PDF Auto-Matching</div>
                <div className="lp-feat-desc">Filenames are matched to contact names case-insensitively. Unmatched files can be manually assigned.</div>
              </div>

              <div className="lp-feat-card">
                <div className="lp-feat-icon">⬡</div>
                <div className="lp-feat-title">WhatsApp QR Connection</div>
                <div className="lp-feat-desc">Scan a QR code to connect your WhatsApp. Session persists locally — no re-scanning on restart.</div>
              </div>

              <div className="lp-feat-card">
                <div className="lp-feat-icon">☰</div>
                <div className="lp-feat-title">Sending Queue</div>
                <div className="lp-feat-desc">Preview every document before sending. Real-time progress bar, per-recipient status, and queue cancellation.</div>
              </div>

              <div className="lp-feat-card">
                <div className="lp-feat-icon">⊘</div>
                <div className="lp-feat-title">Duplicate Protection</div>
                <div className="lp-feat-desc">The system detects already-sent documents by file hash and phone number and skips them automatically.</div>
              </div>

              <div className="lp-feat-card">
                <div className="lp-feat-icon">◷</div>
                <div className="lp-feat-title">History &amp; Retry</div>
                <div className="lp-feat-desc">Every message is logged. Filter by Sent, Failed, or Pending. Retry failed deliveries with one click.</div>
              </div>
            </div>
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section className="lp-hiw" id="lp-howitworks">
          <div className="lp-container">
            <div style={{textAlign:'center', marginBottom:'52px'}}>
              <span className="lp-eyebrow">How It Works</span>
              <h2 className="lp-h2">Four steps. Zero manual searching.</h2>
            </div>
            <div className="lp-steps">
              <div className="lp-step">
                <div className="lp-step-num-big"><span>01</span></div>
                <div className="lp-step-title">Upload Excel</div>
                <div className="lp-step-desc">Import your contact list from any Excel file. Names and mobile numbers are read automatically.</div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num-big"><span>02</span></div>
                <div className="lp-step-title">Connect WhatsApp</div>
                <div className="lp-step-desc">Scan the QR code with your phone. Your session is saved locally and persists across restarts.</div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num-big"><span>03</span></div>
                <div className="lp-step-title">Match PDFs</div>
                <div className="lp-step-desc">Load your PDF folder. Documents are matched by filename. Manual override for unmatched files.</div>
              </div>
              <div className="lp-step">
                <div className="lp-step-num-big"><span>04</span></div>
                <div className="lp-step-title">Review &amp; Send</div>
                <div className="lp-step-desc">Inspect the queue, customize the caption, and start sending. Progress updates in real time.</div>
              </div>
            </div>
          </div>
        </section>

        {/* DASHBOARD PREVIEW */}
        <section className="lp-preview">
          <div className="lp-container">
            <div className="lp-preview-hdr">
              <span className="lp-eyebrow">Product Preview</span>
              <h2 className="lp-h2">The actual dashboard.</h2>
              <p className="lp-sub" style={{textAlign:'center', margin:'12px auto 0'}}>A practical interface showing exactly what matters — contacts, PDFs, status, and history.</p>
            </div>
            <div className="lp-dashboard">
              <div className="lp-dash-topbar">
                <div className="lp-topbar-dot" style={{background:'#ef4444'}}></div>
                <div className="lp-topbar-dot" style={{background:'#f59e0b', margin:'0 5px'}}></div>
                <div className="lp-topbar-dot" style={{background:'#22c55e'}}></div>
                <span style={{fontSize:'12px', color:'#475569', marginLeft:'16px'}}>WhatsApp PDF Automation — Dashboard</span>
              </div>
              <div className="lp-dash-body">
                <div className="lp-dash-sidebar">
                  {['Dashboard','WhatsApp','Excel Contacts','PDF Files','Matching','Send Queue','History','Settings'].map((item, i) => (
                    <div key={item} className={`lp-dash-nav${i === 0 ? ' active' : ''}`}>
                      <span className="lp-nav-dot"></span> {item}
                    </div>
                  ))}
                </div>
                <div className="lp-dash-main">
                  <div className="lp-dash-ptitle">Dashboard</div>
                  <div className="lp-dash-stats">
                    <div className="lp-stat">
                      <div className="lp-stat-label">WhatsApp</div>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',marginTop:'4px'}}>
                        <span style={{width:'8px',height:'8px',borderRadius:'50%',background:'var(--green)',display:'inline-block'}}></span>
                        <span style={{fontSize:'13px',fontWeight:700,color:'var(--green)'}}>Connected</span>
                      </div>
                    </div>
                    <div className="lp-stat">
                      <div className="lp-stat-label">Contacts</div>
                      <div className="lp-stat-val">245</div>
                    </div>
                    <div className="lp-stat">
                      <div className="lp-stat-label">PDFs Ready</div>
                      <div className="lp-stat-val">218</div>
                    </div>
                    <div className="lp-stat">
                      <div className="lp-stat-label">Sent Today</div>
                      <div className="lp-stat-val">194</div>
                      <div className="lp-stat-sub">↑ 94%</div>
                    </div>
                  </div>
                  <div className="lp-dash-table">
                    <div className="lp-table-head">
                      {['Person','PDF File','Mobile','Status','Time'].map(h => (
                        <span key={h} className="lp-col-head">{h}</span>
                      ))}
                    </div>
                    {[
                      ['Shlok Lokhande','Shlok.pdf','+91 •••• 7499','sent','12:42'],
                      ['Naman Shah','Naman.pdf','+91 •••• 3210','sent','12:41'],
                      ['Rahul Patil','Rahul.pdf','+91 •••• 5688','sending','12:40'],
                    ].map(([name, file, phone, status, time]) => (
                      <div key={name} className="lp-table-row">
                        <span className="lp-cell bold">{name}</span>
                        <span className="lp-cell">{file}</span>
                        <span className="lp-cell" style={{fontFamily:'monospace'}}>{phone}</span>
                        {status === 'sent'
                          ? <span className="lp-badge-sent" style={{fontSize:'11.5px',padding:'3px 9px'}}>✓ Sent</span>
                          : <span className="lp-badge-sending" style={{fontSize:'11.5px',padding:'3px 9px'}}>● Sending</span>}
                        <span className="lp-cell">{time}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* MULTI-COMPANY */}
        <section className="lp-mc">
          <div className="lp-mc-inner">
            <div>
              <span className="lp-eyebrow">Multi-Company</span>
              <h2 className="lp-h2">Every company connects its own WhatsApp.</h2>
              <p className="lp-sub">Each company has its own contacts, documents, history and WhatsApp session. Sessions are fully isolated — Company A can never inherit Company B's connection.</p>
              <div style={{marginTop:'28px',padding:'18px 20px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'10px',display:'inline-block'}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--text-primary)',marginBottom:'6px'}}>Session directories</div>
                <div style={{fontSize:'12px',fontFamily:'monospace',color:'var(--text-muted)',lineHeight:1.8}}>
                  whatsapp_sessions/<br/>
                  &nbsp;&nbsp;session-company_1/<br/>
                  &nbsp;&nbsp;session-company_2/<br/>
                  &nbsp;&nbsp;session-company_3/
                </div>
              </div>
            </div>
            <div className="lp-co-cards">
              <div className="lp-co-card">
                <div className="lp-co-init">A</div>
                <div style={{flex:1}}>
                  <div className="lp-co-name">Acme Corp</div>
                  <div className="lp-co-detail">245 contacts · 218 PDFs · Session: company_1</div>
                </div>
                <span className="lp-co-badge connected"><span style={{width:'6px',height:'6px',borderRadius:'50%',background:'var(--green)',display:'inline-block'}}></span> Connected</span>
              </div>
              <div className="lp-co-card">
                <div className="lp-co-init b">B</div>
                <div style={{flex:1}}>
                  <div className="lp-co-name">Beta Solutions</div>
                  <div className="lp-co-detail">89 contacts · 76 PDFs · Session: company_2</div>
                </div>
                <span className="lp-co-badge ready">QR Ready</span>
              </div>
              <div style={{padding:'16px 20px',background:'var(--border-soft)',border:'1px dashed var(--border)',borderRadius:'10px',textAlign:'center'}}>
                <div style={{fontSize:'12.5px',color:'var(--text-muted)'}}>Each company logs in independently.<br/>Scanning QR always generates a fresh code.</div>
              </div>
            </div>
          </div>
        </section>

        {/* PIPELINE */}
        <section className="lp-pipeline">
          <div className="lp-pipeline-inner">
            <span className="lp-eyebrow">The Pipeline</span>
            <h2 className="lp-h2">From spreadsheet to WhatsApp.</h2>
            <p className="lp-sub" style={{textAlign:'center',margin:'12px auto 0'}}>Every step is visible, reviewable and under your control.</p>
            <div className="lp-pipeline-steps">
              {[
                {emoji:'📊', label:'Excel'},
                {emoji:'👥', label:'Contacts'},
                {emoji:'📄', label:'PDFs'},
                {emoji:'⇄', label:'Match'},
                {emoji:'✓', label:'Review'},
                {emoji:'💬', label:'WhatsApp'},
                {emoji:'✓', label:'Delivered', final:true},
              ].map((step, i, arr) => (
                <React.Fragment key={step.label}>
                  <div className="lp-pipe-step">
                    <div className="lp-pipe-node" style={step.final ? {borderColor:'var(--green)',background:'var(--green-tint)'} : {}}>
                      {step.emoji}
                    </div>
                    <div className="lp-pipe-label" style={step.final ? {color:'var(--green)'} : {}}>{step.label}</div>
                  </div>
                  {i < arr.length - 1 && <div className="lp-pipe-arrow"></div>}
                </React.Fragment>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="lp-cta">
          <div className="lp-cta-inner">
            <h2 className="lp-cta-h">Ready to automate your document sending?</h2>
            <p className="lp-cta-sub">Import your contacts, connect WhatsApp and start sending documents with a simple, reliable workflow.</p>
            <Link to="/signup" className="lp-btn-hero-primary" style={{fontSize:'16px',padding:'14px 32px'}}>Get Started →</Link>
          </div>
        </section>

        {/* FAQ */}
        <section className="lp-faq" id="lp-faq">
          <div className="lp-faq-inner">
            <div className="lp-faq-hdr">
              <span className="lp-eyebrow">FAQ</span>
              <h2 className="lp-h2">Common questions.</h2>
            </div>
            <div className="lp-faq-list">
              {[
                ['How does it work?', 'Import your Excel contact list, select the folder containing your PDF documents, connect your WhatsApp by scanning a QR code, and start the sending queue. The system automatically matches each PDF to the correct contact and delivers it.'],
                ['Do I need to enter every WhatsApp number manually?', 'No. Numbers are imported directly from your Excel file. The system normalizes Indian numbers automatically — 10-digit, +91 prefix, 0 prefix, and 91 prefix formats are all supported.'],
                ['Can different companies use it independently?', 'Yes. Each company registers with its own account. Contacts, PDFs, message history, settings, and WhatsApp sessions are fully isolated per company.'],
                ['Do I need MongoDB or any external database?', 'No. The application uses a local SQLite database. No external database server, MongoDB Atlas, or cloud service is required.'],
                ['Where are the PDF files stored?', 'PDFs remain on the local computer running the application. You specify a local folder path and the system reads files from there. Files are never uploaded to an external server.'],
                ['What happens if a PDF is accidentally sent twice?', 'The system checks a file hash and phone number before each send. If already delivered, it is marked "Already Sent" and skipped. You can override with "Send Again" if needed.'],
              ].map(([q, a]) => (
                <details key={q}>
                  <summary>{q} <span className="lp-faq-chevron">+</span></summary>
                  <div className="lp-faq-answer">{a}</div>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* FOOTER */}
        <footer className="lp-footer">
          <div className="lp-footer-inner">
            <div className="lp-footer-top">
              <div>
                <div className="lp-footer-brand">WhatsApp PDF Automation</div>
                <p className="lp-footer-desc">A practical automation tool for sending PDF documents through WhatsApp using Excel contact lists.</p>
              </div>
              <div>
                <div className="lp-footer-col-title">Product</div>
                <ul className="lp-footer-links">
                  <li><a href="#lp-features">Features</a></li>
                  <li><a href="#lp-howitworks">How It Works</a></li>
                  <li><a href="#lp-faq">FAQ</a></li>
                </ul>
              </div>
              <div>
                <div className="lp-footer-col-title">Account</div>
                <ul className="lp-footer-links">
                  <li><Link to="/signin" style={{color:'#64748b',textDecoration:'none'}}>Sign In</Link></li>
                  <li><Link to="/signup" style={{color:'#64748b',textDecoration:'none'}}>Create Account</Link></li>
                </ul>
              </div>
            </div>
            <div className="lp-footer-bottom">
              <span className="lp-footer-copy">© 2026 WhatsApp PDF Automation. All rights reserved.</span>
              <div className="lp-footer-legal">
                <a href="#">Privacy</a>
                <a href="#">Terms</a>
              </div>
            </div>
          </div>
        </footer>

      </div>
    </div>
  );
};

export default Landing;
