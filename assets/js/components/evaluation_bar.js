import { winningChances } from '../modules/sparring/evaluation.js';

export function evaluationBarValue(analysis) {
    const score = analysis?.score;
    if (!score || !Number.isFinite(score.value)) return null;
    const white = winningChances(score, analysis.turn, 'w');
    if (score.type === 'mate') return { white, text: score.value === 0 ? '#' : 'M' + Math.abs(score.value) };
    const pawns = score.value * (analysis.turn === 'w' ? 1 : -1) / 100;
    return { white, text: (pawns > 0 ? '+' : '') + pawns.toFixed(1) };
}

export function renderEvaluationBar(element, analysis, orientation, labels) {
    const value = evaluationBarValue(analysis);
    element.dataset.orientation = orientation;
    element.setAttribute('aria-busy', String(!value));
    if (!value && element.dataset.hasEvaluation === 'true') {
        element.title = labels.analysing;
        return;
    }
    element.dataset.hasEvaluation = String(Boolean(value));
    element.style.setProperty('--white-share', (value?.white ?? 50) + '%');
    element.querySelector('span').textContent = value?.text ?? '…';
    element.setAttribute('aria-valuetext', value ? labels.evaluation + ': ' + value.text : labels.analysing);
    element.setAttribute('aria-valuenow', String(value?.white ?? 50));
    element.title = element.getAttribute('aria-valuetext');
}
