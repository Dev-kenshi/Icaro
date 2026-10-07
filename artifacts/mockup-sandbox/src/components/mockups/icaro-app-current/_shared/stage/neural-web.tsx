import type { CSSProperties } from 'react';
import type { CosmosScene } from './cosmos/renderer';
import type { SpeechEmotion } from '@/lib/speech-plan';

const GLYPHS = ['ᚷ', 'ᛟ', 'ᚾ', 'ᛉ', 'ᚹ', 'ᛞ', 'ᚠ', 'ᚢ', 'ᛋ', 'ᛒ', 'ᛗ'];
const SPORES = [
  { left: 12, top: 34 }, { left: 24, top: 71 }, { left: 34, top: 19 }, { left: 68, top: 23 },
  { left: 82, top: 39 }, { left: 76, top: 74 }, { left: 54, top: 84 }, { left: 43, top: 10 },
];

export function NeuralWeb({ state, scene, emotion = 'sério', longListening = false, thoughtTitle = '' }: { state: string; scene: CosmosScene; emotion?: SpeechEmotion; longListening?: boolean; thoughtTitle?: string }) {
  return (
    <div className="neural-web" data-state={state} data-scene={scene} data-emotion={emotion} data-long-listening={longListening} aria-hidden="true">
      <svg viewBox="0 0 1200 720" preserveAspectRatio="none">
        <path d="M0 110 124 206 212 110 344 184 420 66 530 178 614 90 726 190 842 86 940 174 1055 90 1200 198M0 490 110 390 218 536 342 414 438 612 548 436 660 570 778 420 884 600 1006 424 1118 536 1200 460M124 206 110 390M212 110 218 536M344 184 342 414M420 66 438 612M530 178 548 436M614 90 660 570M726 190 778 420M842 86 884 600M940 174 1006 424M1055 90 1118 536" />
        <path className="neural-web__orbit" d="M72 326C245 214 352 244 472 340S710 466 864 338 1074 210 1160 324" />
      </svg>
      {([['outer', 32], ['inner', 24]] as const).map(([ring, length]) => (
        <div key={ring} className={`glyph-ring glyph-ring--${ring}`}>
          {Array.from({ length }, (_, index) => {
            const angle = index * 360 / length;
            return (
              <span
                key={index}
                className="glyph-ring__mark"
                style={{ transform: `rotate(${angle}deg) translateY(calc(0px - var(--glyph-offset))) rotate(-${angle}deg)` }}
              >
                {GLYPHS[index % GLYPHS.length]}
              </span>
            );
          })}
        </div>
      ))}
      <i className="glyph-frame glyph-frame--left" /><i className="glyph-frame glyph-frame--right" />
      <span className="glyph-label glyph-label--left">ᚷ · ᛟ · ᚾ</span><span className="glyph-label glyph-label--right">ᛉ · ᚹ · ᛞ</span>
      <span className="neural-pulse neural-pulse--one" /><span className="neural-pulse neural-pulse--two" />
      <span className="neural-thought">{thoughtTitle}</span>
      {SPORES.map((spore, index) => (
        <i
          key={index}
          className="neural-spore"
          style={{
            left: `${spore.left}%`,
            top: `${spore.top}%`,
            '--pull-x': `${50 - spore.left}vw`,
            '--pull-y': `${42 - spore.top}vh`,
            animationDelay: `${index * -.37}s`,
          } as CSSProperties}
        />
      ))}
    </div>
  );
}