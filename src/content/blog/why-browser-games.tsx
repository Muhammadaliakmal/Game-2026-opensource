/**
 * Post 3. The material is the performance work the constraint forced —
 * occlusion culling figures from the renderer notes, the frame cap and the
 * `advance()` unit trap — plus the monetisation decisions that are visible in
 * `lib/ads.ts` and `lib/arcade-payout.ts`.
 *
 * The load-time claim is deliberately left qualitative: there is no measured
 * figure for it in the repository, and inventing one would be the exact
 * failure this blog was set up to avoid.
 */
export default function Post() {
  return (
    <>
      <p>
        A link opens a game. That is the entire argument for building this on
        the web rather than in Unity, and after a few months of it I still
        think it is the right trade — but it is a trade, and the costs landed
        in places I did not expect.
      </p>

      <h2>What the web actually buys</h2>
      <p>
        No download. No store review. No install. The same build runs on a
        phone and a laptop, and when I fix something everybody has the fix on
        their next page load rather than whenever they next update.
      </p>
      <p>
        The part I underrated is the store review. Not the delay — the fact
        that shipping a small change is a decision with an approval process
        attached to it changes what you are willing to try. On the web a risky
        idea costs a deploy. That shows up in the work.
      </p>

      <h2>What it costs, specifically</h2>
      <p>
        Everything has to arrive before somebody gives up waiting. That one
        constraint is responsible for most of the engineering in this project,
        and it is worth being concrete about what it forced.
      </p>
      <p>
        <strong>Occlusion culling.</strong> A voxel world is mostly blocks
        nobody can see. The island world drops about 45% of its parts before
        anything is drawn, because an island has an inside and the inside is
        never visible from outside it. Vapor Ridge drops a much smaller share,
        under a tenth, because it is mostly surface. Neon Circuit drops nothing
        at all — it is flat, and a flat world has no interior to hide. I found
        that last one satisfying: the optimisation is not a percentage you
        apply, it is a property of the shape.
      </p>
      <p>
        <strong>A frame cap, on phones only.</strong> Rendering every frame the
        browser offers sounds like the generous default. On a 120 Hz phone it
        means doing twice the GPU work for frames the game never uses, getting
        hot, and throttling to <em>below</em> 60 — so the setting that looks
        like maximum quality produces the worst result on the devices it
        matters most on.
      </p>
      <p>
        The part I got wrong was applying the cap everywhere. On a desktop it
        buys nothing and costs pacing, and the arithmetic is unforgiving: 60
        frames do not divide 144 ticks, so holding a true 60 on a 144 Hz panel
        means alternating two ticks and three forever — frames landing 13.9 ms
        and 20.8 ms apart, each rendered with the delta of the gap before it
        rather than the gap it will be shown for. That is judder, and no amount
        of tuning fixes it, because it is division. Touch devices are capped;
        everything else renders on every tick and lets vsync do the spacing.
      </p>
      <p>
        <strong>And a unit bug I will remember forever.</strong> The manual
        frame-advance call takes seconds. The browser&apos;s high-resolution
        clock returns milliseconds. Passing one to the other hands the first
        frame a delta of roughly a million seconds, and a physics engine asked
        to simulate a million seconds does something spectacular before it does
        anything useful. It cost me an afternoon and it was two characters.
      </p>

      <h2>Discovery is the real cost, and I do not have an answer yet</h2>
      <p>
        An app store is a bad deal in most respects and a good one in exactly
        this respect: people go there looking for games. Nobody goes to the
        open web looking for a browser platformer by a person they have never
        heard of.
      </p>
      <p>
        I do not have this solved. I have not launched properly, so I do not
        have traffic numbers worth quoting, and I would rather say that than
        invent a figure. What I have done is stop treating the game as the only
        thing on the site — every course now has a page describing how it is
        built and how to play it, which is a page that can be linked to,
        indexed and read by somebody who has not pressed play yet. Whether that
        works is something I will be able to answer in a few months.
      </p>

      <h2>How I am approaching money, and why</h2>
      <p>
        Two decisions, and the reasoning behind both is the same: do not put
        the thing that makes money in the way of the thing people came for.
      </p>
      <p>
        <strong>Ads go on the content pages, never over the canvas.</strong>{" "}
        There are two reasons and the second is the one that actually decides
        it. An ad beside a 60 fps canvas competes with it for the main thread,
        so it makes the game worse in a way the player will blame the game for.
        And an ad next to a control somebody is tapping at speed is an
        accidental click — which is the kind of traffic that gets a publisher
        account closed rather than paid. There are none on the shop either; a
        real-money ad next to a coin price is a confusing purchase flow no
        matter who served it.
      </p>
      <p>
        <strong>The in-game currency converts to nothing.</strong> Coins are
        earned by playing, they buy characters, and that is the end of the
        loop. You cannot buy them and you cannot cash them out. It is a
        progression system rather than an economy, which is a much smaller
        thing to get right.
      </p>
      <p>
        One implementation note that is worth stating plainly: arcade payouts
        are computed on the server. A balance held by the client is a balance
        the player can edit, and the moment a currency is worth editing,
        somebody will. There is a daily soft cap too, deliberately not a hard
        stop at zero — going over it drops your rate rather than ending your
        earnings, because a number that stops moving reads as a bug and a
        number that slows down reads as a rule.
      </p>

      <h2>Would I do it again</h2>
      <p>
        Yes, with clearer eyes about which problems I was signing up for. The
        performance work was harder than I expected and more interesting than I
        expected, and it is genuinely the case that most of the good decisions
        in this codebase exist because a constraint forced them.
      </p>
      <p>
        Discovery is the open question. Ask me in six months.
      </p>
    </>
  );
}
