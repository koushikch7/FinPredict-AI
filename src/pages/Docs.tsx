import { Card } from '../components/Card';

export function DocsPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      <header>
        <h1 className="page-title page-title-bar text-3xl sm:text-4xl font-display font-black tracking-tighter uppercase bg-gradient-to-r from-slate-900 via-indigo-800 to-fuchsia-800 bg-clip-text text-transparent">Docs</h1>
        <p className="text-xs text-[#141414]/50 uppercase tracking-widest">How FinPredict-AI works</p>
      </header>

      <Card title="Getting Started">
        <ol className="list-decimal pl-5 space-y-2 text-sm leading-relaxed">
          <li>Connect at least one broker on the <b>Brokers</b> page (Zerodha Kite is the default and recommended).</li>
          <li>Visit <b>Portfolio</b> to sync holdings, or add positions manually.</li>
          <li>Run AI analyses on the <b>Predictions</b> page using one of six investing strategies.</li>
          <li>Open the <b>Playground</b> to manage a virtual ₹1L account where the AI can buy/sell autonomously.</li>
          <li>Use the <b>AI Chat</b> for natural-language Q&amp;A across stocks, sectors and news.</li>
        </ol>
      </Card>

      <Card title="Predictions Engine">
        <p className="text-sm leading-relaxed">
          Each prediction synthesises the latest live quote, 100 days of price history, technical indicators (RSI, MACD, SMA, EMA, Bollinger),
          and the freshest news headlines. The output is a strict JSON object containing direction, expected move %, target price, confidence
          and a plain-English rationale, then validated automatically once the horizon expires.
        </p>
      </Card>

      <Card title="Investor Strategies">
        <ul className="list-disc pl-5 text-sm space-y-2">
          <li><b>Buffett</b> — long-term moat, ROE &gt; 15%, low debt, predictable earnings.</li>
          <li><b>Lynch</b> — PEG &lt; 1, growth-at-reasonable-price, niche stories.</li>
          <li><b>Graham</b> — deep value, P/B &lt; 1.5, P/E &lt; 15, margin of safety.</li>
          <li><b>Momentum</b> — relative strength, breakouts, RSI &amp; MACD bullish.</li>
          <li><b>Mean-Reversion</b> — oversold extremes returning to fair value.</li>
          <li><b>Balanced</b> — synthesises all four lenses into a single score.</li>
        </ul>
      </Card>

      <Card title="Auto-Trading (Playground)">
        <p className="text-sm leading-relaxed">
          The AI trader runs every 15 minutes during NSE market hours (Mon–Fri, 9:15–15:30 IST). It evaluates the configured universe,
          requests JSON BUY/SELL/HOLD decisions from the model, and executes paper trades against your virtual capital. Toggle
          <b> Auto-trade</b> on the Playground to enable, configure strategy &amp; risk-level, and click <b>Run AI Cycle</b> for a manual run.
        </p>
      </Card>

      <Card title="Privacy & Keys">
        <p className="text-sm leading-relaxed">
          Broker tokens and AI keys are encrypted and stored in the local SQLite database. Your AI calls can use the system-default
          provider (admin-set) or your personal override (Settings page) which supports any OpenAI-compatible endpoint.
        </p>
      </Card>
    </div>
  );
}
