import { useEffect, useRef } from "preact/hooks";

const HEAD =
  "M16 6.5c4.6 0 7.9 2.6 8.9 6.6l5.8-4.1c.6-.4 1.3.2 1 .8l-5.2 9.7C26 25.2 21.6 29.5 16 29.5S6 25.2 5.5 19.5L.3 9.8c-.3-.6.4-1.2 1-.8l5.8 4.1c1-4 4.3-6.6 8.9-6.6Z";
const WHITES =
  "M9 17.1c1.4-1.3 4-1.5 5.6.4-1 2-4.2 2.2-5.6-.4ZM23 17.1c-1.4-1.3-4-1.5-5.6.4 1 2 4.2 2.2 5.6-.4Z";
/** Eyes shut and curved down: asleep. */
const ASLEEP = "M9.6 17.3c1.3 1.4 3.3 1.4 4.6 0M17.8 17.3c1.3 1.4 3.3 1.4 4.6 0";
/** Eyes shut and curved up: politely not looking. */
const LOOKING_AWAY = "M9.6 18.2c1.3-1.4 3.3-1.4 4.6 0M17.8 18.2c1.3-1.4 3.3-1.4 4.6 0";

/** Where the eyes sit in the 32-unit drawing, and how far the pupils can travel. */
const EYES_Y = 17.6 / 32;
const REACH = { x: 0.9, y: 0.4 };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The goblin, hanging on to the top edge of the sheet with its face peeking over. It watches the
 * pointer, blinks now and then, chomps when something new is hidden, and dozes off when
 * filtering is off. Drawn behind the sheet, with the hands in front of it.
 */
export function Lurker(props: {
  /** Filtering is on. */
  awake: boolean;
  /** How many posts are hidden; each new one gets a chomp. */
  fed?: number;
  /** Eyes shut without falling asleep, for while a key is being typed. */
  shy?: boolean;
}) {
  const { awake, fed = 0, shy } = props;
  const drawing = useRef<SVGSVGElement>(null);
  const jaw = useRef<SVGGElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const lastFed = useRef(fed);
  const open = awake && !shy;

  useEffect(() => {
    if (fed > lastFed.current && !reducedMotion()) {
      jaw.current?.animate(
        [
          { transform: "none" },
          { transform: "translateY(1.6px) scale(1.06, 0.92)", offset: 0.35 },
          { transform: "translateY(-0.8px) scale(0.98, 1.03)", offset: 0.7 },
          { transform: "none" },
        ],
        { duration: 460, easing: "ease-out" },
      );
    }
    lastFed.current = fed;
  }, [fed]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const look = (x: number, y: number) => {
      const svg = drawing.current;
      const eyes = pupils.current;
      if (!svg || !eyes) return;
      const box = svg.getBoundingClientRect();
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height * EYES_Y);
      const distance = Math.hypot(dx, dy) || 1;
      // Full reach once the pointer is a little way off; nearer, the eyes turn less.
      const reach = Math.min(distance / 140, 1);
      eyes.style.transform = `translate(${(dx / distance) * reach * REACH.x}px, ${(dy / distance) * reach * REACH.y}px)`;
    };
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => look(event.clientX, event.clientY));
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      if (pupils.current) pupils.current.style.transform = "";
    };
    addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [open]);

  return (
    <>
      <svg
        ref={drawing}
        class={awake ? "lurker" : "lurker is-asleep"}
        viewBox="0 0 32 32"
        aria-hidden="true"
      >
        <defs>
          <clipPath id="lurker-whites">
            <path d={WHITES} />
          </clipPath>
        </defs>
        <g class="lurker-rise">
          <g class="lurker-sink">
            <g ref={jaw} class="lurker-jaw">
              <path class="lurker-head" d={HEAD} />
              {open ? (
                <g class="lurker-eyes">
                  <path class="lurker-whites" d={WHITES} />
                  <g clip-path="url(#lurker-whites)">
                    <g ref={pupils} class="lurker-pupils">
                      <circle cx="12.6" cy="17.6" r="1.05" />
                      <circle cx="19.4" cy="17.6" r="1.05" />
                    </g>
                  </g>
                </g>
              ) : (
                <path class="lurker-shut" d={awake ? LOOKING_AWAY : ASLEEP} />
              )}
            </g>
          </g>
        </g>
      </svg>
      <span class="lurker-hands" aria-hidden="true">
        <Hand />
        <Hand />
      </span>
      {!awake && (
        <span class="lurker-z" aria-hidden="true">
          <i>z</i>
          <i>z</i>
        </span>
      )}
    </>
  );
}

/** Three fingertips over the edge. */
function Hand() {
  return (
    <svg viewBox="0 0 18 9" width="18" height="9">
      <rect x="0" width="5.4" height="9" rx="2.7" />
      <rect x="6.3" width="5.4" height="9" rx="2.7" />
      <rect x="12.6" width="5.4" height="9" rx="2.7" />
    </svg>
  );
}
