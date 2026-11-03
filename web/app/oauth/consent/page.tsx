export const dynamic = 'force-dynamic';

// Do not expose the draft consent component until grant creation and the
// separate OAuth approval can be safely reconciled under failures and races.
export default function ConsentPage() {
  return <main><header><a className="brand" href="/">fluent<span>loop</span>.</a></header><section className="notice"><h1>AI connections are not available yet.</h1><p>No access has been granted from this page. Please return to your notebook.</p><a href="/">Back to FluentLoop</a></section></main>;
}
