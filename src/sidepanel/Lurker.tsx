import { useEffect, useRef } from "preact/hooks";

/** Outer head + swept ears silhouette (left ear has a scrappy wedge notch). */
const HEAD =
  "M54 6C65.5 6 75.5 10.8 81.2 20.2 90 12.6 98.8 8.4 105.2 8.2c1.6 0 2.1 1.7 1 3.4-5 8.2-11.2 20.9-19.7 30.2 3 8 1.7 17.7-4.1 27C75.8 79.2 65.2 82.5 54 82.5S32.2 79.2 25.6 68.8c-5.8-9.3-7.1-19-4.1-27C13 32.5 6.8 19.8 1.8 11.6.7 9.9 1.2 8.2 2.8 8.2c4.8.2 9.6 2.1 14 4.8l1.4 5.8 4-2.8c2.3 1.3 3.6 2.7 4.6 4.2C32.5 10.8 42.5 6 54 6Z";

const EAR_INNER_L =
  "M24.2 25.5c-1.7-1.7-3.4-3.1-5-4.3l-3.4 1.6-1.3-6c-3.7-2.3-7-4-9.5-4.6 4.4 7.3 9.8 17.3 17.5 25.3.5-4.7 1-8.7 1.7-12Z";
const EAR_INNER_R =
  "M83.8 25.5c5.7-5.7 13-11.3 19.2-13.3-4.4 7.3-9.8 17.3-17.5 25.3-.5-4.7-1-8.7-1.7-12Z";

const EYE_L = "M26.5 35.5c6.5-5 17-3 22.5 5-4.8 9-18 8.6-22.5-5Z";
const EYE_R = "M81.5 35.5c-6.5-5-17-3-22.5 5 4.8 9 18 8.6 22.5-5Z";
const EYES = `${EYE_L}${EYE_R}`;

/** Tucked behind the sheet at y=50 when idle; pops into view during a chomp. */
const MOUTH = "M33 54.5c10.5 4.5 31.5 4.5 42 0-2.8 12.5-11.5 18-21 18s-18.2-5.5-21-18Z";

/** Where the eyes sit in the 108×84 drawing, and how far the irises can travel. */
const EYES_Y = 40.5 / 84;
const REACH = { x: 2.5, y: 1.35 };

const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The goblin, hanging on to the top edge of the sheet with its face peeking over. It watches the
 * pointer, blinks now and then, lunges up to chomp when something new is hidden, covers its eyes
 * while a key is typed, and dozes off when filtering is off. Drawn behind the sheet, with its
 * clawed hands in front of it.
 */
export function Lurker(props: {
  /** Filtering is on. */
  awake: boolean;
  /** How many posts are hidden, once the list has loaded; each new one gets a chomp. */
  fed?: number;
  /** Covers its eyes without falling asleep, for while a key is being typed. */
  shy?: boolean;
}) {
  const { awake, fed, shy } = props;
  const drawing = useRef<SVGSVGElement>(null);
  const jaw = useRef<SVGGElement>(null);
  const hands = useRef<HTMLSpanElement>(null);
  const pupils = useRef<SVGGElement>(null);
  const glints = useRef<SVGGElement>(null);
  const brows = useRef<SVGGElement>(null);
  const lastFed = useRef(fed);
  const open = awake && !shy;

  useEffect(() => {
    // The list arriving as the panel opens isn't news.
    const before = lastFed.current;
    if (fed !== undefined && before !== undefined && fed > before && !reducedMotion()) {
      jaw.current?.animate(
        [
          { transform: "none" },
          { transform: "translateY(-14.5px) scale(0.98, 1.03)", offset: 0.28 },
          { transform: "translateY(-10.5px) scale(1.04, 0.94)", offset: 0.5 },
          { transform: "translateY(-13px) scale(0.99, 1.02)", offset: 0.68 },
          { transform: "none" },
        ],
        { duration: 600, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
      );
      hands.current?.animate(
        [
          { transform: "none" },
          { transform: "translateY(1.5px) scaleY(0.92)", offset: 0.3 },
          { transform: "translateY(-0.5px) scaleY(1.03)", offset: 0.65 },
          { transform: "none" },
        ],
        { duration: 600, easing: "ease-out" },
      );
    }
    lastFed.current = fed;
  }, [fed]);

  useEffect(() => {
    if (!open) return;
    let frame = 0;
    const look = (x: number, y: number) => {
      const svg = drawing.current;
      const iris = pupils.current;
      if (!svg || !iris) return;
      const box = svg.getBoundingClientRect();
      const dx = x - (box.left + box.width / 2);
      const dy = y - (box.top + box.height * EYES_Y);
      const distance = Math.hypot(dx, dy) || 1;
      // Full reach once the pointer is a little way off; nearer, the eyes turn less.
      const reach = Math.min(distance / 140, 1);
      const tx = (dx / distance) * reach * REACH.x;
      const ty = (dy / distance) * reach * REACH.y;
      iris.style.transform = `translate(${tx}px, ${ty}px)`;
      if (glints.current) {
        glints.current.style.transform = `translate(${tx * 0.32}px, ${ty * 0.32}px)`;
      }
      if (brows.current) {
        brows.current.style.transform = `translate(${tx * 0.24}px, ${ty * 0.34}px)`;
      }
    };
    const onMove = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => look(event.clientX, event.clientY));
    };
    const onLeave = () => {
      cancelAnimationFrame(frame);
      if (pupils.current) pupils.current.style.transform = "";
      if (glints.current) glints.current.style.transform = "";
      if (brows.current) brows.current.style.transform = "";
    };
    addEventListener("pointermove", onMove);
    document.documentElement.addEventListener("pointerleave", onLeave);
    return () => {
      cancelAnimationFrame(frame);
      removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
    };
  }, [open]);

  const lurkerClass = awake ? "lurker" : "lurker is-asleep";
  const handsClass = shy ? "lurker-hands is-shy" : "lurker-hands";

  return (
    <>
      <svg ref={drawing} class={lurkerClass} viewBox="0 0 108 84" aria-hidden="true">
        <defs>
          <radialGradient id="lurker-skin" cx="50%" cy="26%" r="68%" fx="46%" fy="20%">
            <stop offset="0%" class="goblin-stop-hi" />
            <stop offset="40%" class="goblin-stop-mid" />
            <stop offset="78%" class="goblin-stop-lo" />
            <stop offset="100%" class="goblin-stop-deep" />
          </radialGradient>
          <linearGradient id="lurker-hand-skin" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" class="goblin-stop-hi" />
            <stop offset="52%" class="goblin-stop-mid" />
            <stop offset="100%" class="goblin-stop-lo" />
          </linearGradient>
          <linearGradient id="lurker-ear-l" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#c4a647" />
            <stop offset="55%" stop-color="#7e8426" />
            <stop offset="100%" stop-color="#3c5b10" />
          </linearGradient>
          <linearGradient id="lurker-ear-r" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#c4a647" />
            <stop offset="55%" stop-color="#7e8426" />
            <stop offset="100%" stop-color="#3c5b10" />
          </linearGradient>
          <radialGradient id="lurker-iris" cx="48%" cy="44%" r="55%">
            <stop offset="0%" stop-color="#fff48a" />
            <stop offset="42%" stop-color="#ffca28" />
            <stop offset="80%" stop-color="#db7006" />
            <stop offset="100%" stop-color="#5c2802" />
          </radialGradient>
          <linearGradient id="lurker-sclera" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="#d4ca9e" />
            <stop offset="32%" stop-color="#fcf8e8" />
            <stop offset="100%" stop-color="#f5eed3" />
          </linearGradient>
          <clipPath id="lurker-head-clip">
            <path d={HEAD} />
          </clipPath>
          <clipPath id="lurker-eyes-clip">
            <path d={EYES} />
          </clipPath>
          <clipPath id="lurker-mouth-clip">
            <path d={MOUTH} />
          </clipPath>
        </defs>

        <g class="lurker-rise">
          <g class="lurker-sink">
            <g ref={jaw} class="lurker-jaw">
              {/* Soft grounding shadow against the green header ground */}
              <path d={HEAD} transform="translate(0 2)" fill="#0c1502" opacity="0.28" />

              <g clip-path="url(#lurker-head-clip)">
                <path d={HEAD} fill="url(#lurker-skin)" />
                <path d={EAR_INNER_L} fill="url(#lurker-ear-l)" />
                <path d={EAR_INNER_R} fill="url(#lurker-ear-r)" />
                <path
                  d="M10.5 16.5C14 23 18 29.5 22.8 33.8M97.5 16.5C94 23 90 29.5 85.2 33.8"
                  fill="none"
                  stroke="#d4e87b"
                  stroke-width="1.4"
                  stroke-linecap="round"
                  opacity="0.48"
                />

                {/* Recessed eye sockets & cheek volume */}
                <ellipse
                  cx="38"
                  cy="39.5"
                  rx="13"
                  ry="9.2"
                  transform="rotate(12 38 39.5)"
                  fill="#1d3204"
                  opacity="0.54"
                />
                <ellipse
                  cx="70"
                  cy="39.5"
                  rx="13"
                  ry="9.2"
                  transform="rotate(-12 70 39.5)"
                  fill="#1d3204"
                  opacity="0.54"
                />
                <ellipse
                  class="lurker-cheek"
                  cx="29"
                  cy="49"
                  rx="7.5"
                  ry="4.5"
                  transform="rotate(18 29 49)"
                />
                <ellipse
                  class="lurker-cheek"
                  cx="79"
                  cy="49"
                  rx="7.5"
                  ry="4.5"
                  transform="rotate(-18 79 49)"
                />

                {/* Forehead freckles & glabella scowl lines */}
                <circle cx="38" cy="19.5" r="1.35" fill="#36580d" opacity="0.5" />
                <circle cx="41.5" cy="17.2" r="0.9" fill="#36580d" opacity="0.42" />
                <path
                  d="M51.2 30.5c.4 2.3.6 4.3.6 6M56.8 30.5c-.4 2.3-.6 4.3-.6 6"
                  fill="none"
                  stroke="#1e3305"
                  stroke-width="1.5"
                  stroke-linecap="round"
                  opacity="0.68"
                />

                {/* Top crown & ear rim highlight */}
                <path
                  class="lurker-rim"
                  d={HEAD}
                  transform="translate(0 1.8)"
                  fill="none"
                  stroke-width="2.6"
                />
              </g>

              <path
                class="lurker-outline"
                d={HEAD}
                fill="none"
                stroke-width="2.6"
                stroke-linejoin="round"
              />

              {open ? (
                <g class="lurker-open">
                  <g clip-path="url(#lurker-eyes-clip)">
                    <path d={EYES} fill="url(#lurker-sclera)" />
                    <g ref={pupils} class="lurker-pupils">
                      <circle cx="39.2" cy="40.5" r="7.4" fill="url(#lurker-iris)" />
                      <ellipse cx="39.5" cy="40.5" rx="2.9" ry="4.1" fill="#12100a" />
                      <circle cx="41.8" cy="43.3" r="0.95" fill="#fff5ba" opacity="0.9" />

                      <circle cx="68.8" cy="40.5" r="7.4" fill="url(#lurker-iris)" />
                      <ellipse cx="68.5" cy="40.5" rx="2.9" ry="4.1" fill="#12100a" />
                      <circle cx="70.8" cy="43.3" r="0.95" fill="#fff5ba" opacity="0.9" />
                    </g>
                    <g ref={glints} class="lurker-glints">
                      <ellipse
                        cx="36.6"
                        cy="37.5"
                        rx="2.1"
                        ry="1.3"
                        transform="rotate(-25 36.6 37.5)"
                        fill="#ffffff"
                      />
                      <ellipse
                        cx="66.2"
                        cy="37.5"
                        rx="2.1"
                        ry="1.3"
                        transform="rotate(-25 66.2 37.5)"
                        fill="#ffffff"
                      />
                    </g>
                    {/* Upper green eyelid that sweeps down during blinks */}
                    <rect class="lurker-lid" x="24" y="29" width="60" height="22" />
                  </g>
                  <path
                    class="lurker-outline"
                    d={EYES}
                    fill="none"
                    stroke-width="2"
                    stroke-linejoin="round"
                  />
                  <g ref={brows} class="lurker-brows">
                    <path
                      d="M25 31.8c7.5-3.7 17.5-1 24.8 6M83 31.8c-7.5-3.7-17.5-1-24.8 6"
                      fill="none"
                      stroke="#1e3305"
                      stroke-width="3.2"
                      stroke-linecap="round"
                    />
                    <path
                      class="lurker-brow-hi"
                      d="M25.8 30.3c7.2-3.4 16.7-.8 23.4 5.8M82.2 30.3c-7.2-3.4-16.7-.8-23.4 5.8"
                      fill="none"
                      stroke-width="1.5"
                      stroke-linecap="round"
                    />
                  </g>
                </g>
              ) : awake ? (
                <g class="lurker-shut">
                  {/* Tightly squeezed-shut bashful lids */}
                  <path
                    class="lurker-outline"
                    d="M28.5 41.8c5-5.3 14-5.3 19 0M60.5 41.8c5-5.3 14-5.3 19 0"
                    fill="none"
                    stroke-width="2.6"
                    stroke-linecap="round"
                  />
                  <path
                    d="M28.5 33.8c6-2 13.5-1 19 2M79.5 33.8c-6-2-13.5-1-19 2"
                    fill="none"
                    stroke="#1e3305"
                    stroke-width="2.5"
                    stroke-linecap="round"
                  />
                </g>
              ) : (
                <g class="lurker-shut">
                  {/* Relaxed sleeping eyelids */}
                  <path
                    class="lurker-sleep-lid"
                    d="M28.5 39c5 5.8 14 5.8 19.3.8M60.2 39.8c5.3 5 14.3 5 19.3-.8"
                    stroke-width="2.4"
                    stroke-linecap="round"
                  />
                  <path
                    d="M27.5 34.5c6.5-1.5 14.5-.5 20.5 2.5M80.5 34.5c-6.5-1.5-14.5-.5-20.5 2.5"
                    fill="none"
                    stroke="#223806"
                    stroke-width="2.4"
                    stroke-linecap="round"
                    opacity="0.7"
                  />
                </g>
              )}

              {/* Crooked goblin nose resting right at the sheet's edge */}
              <path
                class="lurker-nose"
                d="M51.2 38.5c-1.4 4.7-4.4 8-4.8 10.7-.3 2.2 3.6 4 7.6 4.3 4-.3 7.9-2.1 7.6-4.3-.4-2.7-3.4-6-4.8-10.7Z"
              />
              <path
                class="lurker-outline"
                d="M46.8 48.8c2 3.2 4.8 4.6 7.2 4.6s5.2-1.4 7.2-4.6"
                fill="none"
                stroke-width="1.8"
                stroke-linecap="round"
              />
              <path
                d="M50.8 39.5c-1.3 4-3.4 7-4 9.3M57.2 39.5c1.3 4 3.4 7 4 9.3"
                fill="none"
                stroke="#1e3305"
                stroke-width="1.3"
                stroke-linecap="round"
                opacity="0.55"
              />
              <ellipse
                class="lurker-nostril"
                cx="50.2"
                cy="50.8"
                rx="1.5"
                ry="0.9"
                transform="rotate(18 50.2 50.8)"
              />
              <ellipse
                class="lurker-nostril"
                cx="57.8"
                cy="50.8"
                rx="1.5"
                ry="0.9"
                transform="rotate(-18 57.8 50.8)"
              />
              <path
                class="lurker-rim"
                d="M53.6 39.2c-.5 4-.6 7.6 0 10.6"
                fill="none"
                stroke-width="1.9"
                stroke-linecap="round"
              />

              {/* Fanged mouth: hidden behind the sheet at rest, revealed when chomping */}
              <g clip-path="url(#lurker-mouth-clip)">
                <path d={MOUTH} fill="#22100d" />
                <ellipse cx="54" cy="71.5" rx="12" ry="5.5" fill="#963b2c" />
                <path d="M46 56l2.8 5.5 2.8-4.8 2.8 4.8 2.8-5 2.8 4.6 2.6-5.6Z" fill="#f5f0da" />
                <path d="M38 68.5 42 56.5 46 69.5ZM62 69.5 66 56 70 68.5Z" fill="#fffdf2" />
              </g>
              <path
                class="lurker-outline"
                d={MOUTH}
                fill="none"
                stroke-width="2"
                stroke-linejoin="round"
              />
            </g>
          </g>
        </g>
      </svg>

      <span ref={hands} class={handsClass} aria-hidden="true">
        <Hand side="left" />
        <Hand side="right" />
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

/** Three clawed goblin fingers curling over the sheet edge, or lifting to cover its eyes. */
function Hand({ side }: { side: "left" | "right" }) {
  return (
    <svg
      class={`lurker-hand is-${side}`}
      viewBox="0 0 28 18"
      width="28"
      height="18"
      overflow="visible"
    >
      <g transform={side === "right" ? "scale(-1 1) translate(-28 0)" : undefined}>
        <ellipse class="lurker-hand-shadow" cx="14" cy="12.5" rx="13" ry="4.5" />
        <path
          class="lurker-palm lurker-outline"
          d="M2 6C2 0 25 0 24.5 6.5L23.5 10H3Z"
          fill="url(#lurker-hand-skin)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M2 6.5c-.5-4 5.5-4.7 6.2-.7l.6 5.7c.1 2.5-5.6 2.7-6.3 0Z"
          fill="url(#lurker-hand-skin)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M4.2 11.5 5.6 15.2 7.2 11.4Z"
          fill="#f2ecd5"
          stroke-width="1.1"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M9.8 5.2C9.6 1 16.4 1 16.6 5.2l.2 7c0 2.6-6.6 2.6-6.8 0Z"
          fill="url(#lurker-hand-skin)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M11.8 12.2 13.4 16.2 15 12.2Z"
          fill="#f2ecd5"
          stroke-width="1.1"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M18 6c.2-4 6.5-3.6 6.4.4l-.6 5.4c-.3 2.4-5.6 2.2-5.8-.3Z"
          fill="url(#lurker-hand-skin)"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          class="lurker-outline"
          d="M19.4 11.6 20.8 15.2 22.4 11.5Z"
          fill="#f2ecd5"
          stroke-width="1.1"
          stroke-linejoin="round"
        />
        <ellipse class="lurker-knuckle" cx="5.4" cy="5.2" rx="1.6" ry="0.9" />
        <ellipse class="lurker-knuckle" cx="13.2" cy="4.2" rx="1.8" ry="1" />
        <ellipse class="lurker-knuckle" cx="21.2" cy="5.2" rx="1.6" ry="0.9" />
      </g>
    </svg>
  );
}
