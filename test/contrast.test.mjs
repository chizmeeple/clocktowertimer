import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  contrastOf,
  contrastRatio,
  isLargeText,
  parseColor,
} from './contrast.mjs';

const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
const settingsGroup = '#343434';

function variable(name) {
  const match = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  assert.ok(match, name);
  return match[1].trim();
}

function near(actual, expected) {
  assert.ok(
    Math.abs(actual - expected) < 0.02,
    `expected ${expected}, got ${actual.toFixed(2)}`
  );
}

describe('contrast helper', () => {
  it('matches the measured flat ratios from the audit', () => {
    near(contrastRatio(parseColor('#ffffff'), parseColor('#4caf50')), 2.78);
    near(contrastRatio(parseColor('#ffffff'), parseColor('#45a049')), 3.29);
    near(contrastRatio(parseColor('#ffffff'), parseColor('#f44336')), 3.68);
  });

  it('treats 19.2px bold as large text and 19.2px semibold as normal text', () => {
    assert.equal(isLargeText('19.2px', '700'), true);
    assert.equal(isLargeText('19.2px', '600'), false);
    assert.equal(isLargeText('17.6px', '700'), false);
    assert.equal(isLargeText('40px', '800'), true);
  });
});

describe('contrast palette', () => {
  it('keeps Wake Up bright enough for large white text without dulling it', () => {
    const wakeUp = contrastOf('#ffffff', variable('--colour-accent'));
    const wakeUpHover = contrastOf('#ffffff', variable('--colour-accent-hover'));
    const blitz = contrastOf('#ffffff', variable('--colour-blitz'));
    const blitzHover = contrastOf('#ffffff', variable('--colour-blitz-hover'));
    assert.ok(wakeUp >= 3 && wakeUp < 4, wakeUp);
    assert.ok(wakeUpHover >= 3, wakeUpHover);
    assert.ok(blitz >= 3 && blitz < 4.5, blitz);
    assert.ok(blitzHover >= 3, blitzHover);

    assert.match(css, /#startBtn \{[^}]*font-weight:\s*700/);
    assert.match(css, /#startBtn \{[^}]*font-size:\s*1\.2rem/);
    assert.match(css, /#startBtn \{[^}]*background-color:\s*var\(--colour-accent\)/);
  });

  it('gives white lettering 4.5:1 on the deeper filled buttons', () => {
    for (const name of [
      '--colour-accent-button',
      '--colour-accent-button-hover',
      '--colour-blitz-button',
      '--colour-blitz-button-hover',
    ]) {
      const ratio = contrastOf('#ffffff', variable(name));
      assert.ok(ratio >= 4.5, `${name} ${ratio.toFixed(2)}`);
    }
  });

  it('gives small green and red text 4.5:1 on a settings group', () => {
    for (const name of ['--colour-accent-text', '--colour-blitz-text']) {
      const ratio = contrastOf(variable(name), settingsGroup);
      assert.ok(ratio >= 4.5, `${name} ${ratio.toFixed(2)}`);
    }
    assert.ok(contrastOf('#ffb0aa', settingsGroup) >= 4.5);
  });

  it('keeps the adjusted dawn, traveller, preset, and team colours above their thresholds', () => {
    const dawnPace = contrastOf('#885c2c', [244, 230, 204]);
    assert.ok(dawnPace >= 4.5, dawnPace);
    assert.ok(contrastOf('#b87d3b', '#fff8e6') >= 3);

    const overPage = (red, green, blue, alpha) => [
      red * alpha + 26 * (1 - alpha),
      green * alpha + 26 * (1 - alpha),
      blue * alpha + 26 * (1 - alpha),
    ];
    assert.ok(contrastOf('#ffffff', overPage(198, 93, 0, 0.9)) >= 4.5);
    assert.ok(contrastOf('#101010', variable('--colour-accent')) >= 4.5);
    assert.ok(contrastOf('#101010', variable('--colour-blitz')) >= 4.5);
    assert.ok(contrastOf([255, 255, 255, 0.88], overPage(25, 118, 210, 0.7)) >= 4.5);
    assert.ok(contrastOf([255, 255, 255, 0.88], overPage(211, 47, 47, 0.7)) >= 4.5);
  });
});
