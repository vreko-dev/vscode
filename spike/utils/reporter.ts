/**
 * Console output formatting for spike validation results
 */

export interface SpikeResult {
  name: string;
  description: string;
  status: 'PASS' | 'WARN' | 'FAIL';
  critical: boolean;
  message: string;
  metrics: Record<string, unknown>;
}

export function formatReport(results: SpikeResult[]): string {
  const lines: string[] = [
    '',
    '═══════════════════════════════════════════════════════════════',
    '                    SPIKE VALIDATION REPORT                     ',
    '═══════════════════════════════════════════════════════════════',
    '',
  ];

  for (const result of results) {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'WARN' ? '⚠️' : '❌';
    const critical = result.critical ? ' [CRITICAL]' : '';

    lines.push(`${icon} ${result.name}${critical}`);
    lines.push(`   ${result.description}`);
    lines.push(`   → ${result.message}`);

    // Add key metrics if available
    if (Object.keys(result.metrics).length > 0) {
      const metricStrs: string[] = [];
      if ('elapsed' in result.metrics) metricStrs.push(`${result.metrics.elapsed}ms`);
      if ('nodeCount' in result.metrics) metricStrs.push(`${result.metrics.nodeCount} nodes`);
      if ('systemCount' in result.metrics) metricStrs.push(`${result.metrics.systemCount} systems`);
      if ('opsPerMs' in result.metrics) metricStrs.push(`${result.metrics.opsPerMs} ops/ms`);
      if (metricStrs.length > 0) {
        lines.push(`   📊 ${metricStrs.join(' | ')}`);
      }
    }

    lines.push('');
  }

  const summary = {
    pass: results.filter(r => r.status === 'PASS').length,
    warn: results.filter(r => r.status === 'WARN').length,
    fail: results.filter(r => r.status === 'FAIL').length,
    critical: results.filter(r => r.status === 'FAIL' && r.critical).length,
  };

  lines.push('───────────────────────────────────────────────────────────────');
  lines.push(`SUMMARY: ${summary.pass} PASS | ${summary.warn} WARN | ${summary.fail} FAIL`);
  if (summary.critical > 0) {
    lines.push(`⚠️  ${summary.critical} CRITICAL FAILURE(S) REQUIRE IMMEDIATE ACTION`);
  }
  lines.push('═══════════════════════════════════════════════════════════════');

  return lines.join('\n');
}
