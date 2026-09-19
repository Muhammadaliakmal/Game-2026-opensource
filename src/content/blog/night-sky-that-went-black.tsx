/**
 * Post 1. The material is the light-check story from `docs/blog-outlines.md`
 * and the "The sky" section of CLAUDE.md — the bug, the wrong fix, and the
 * tool that exists because of both.
 *
 * Every specific in it is in the repository: the rule that the night is the
 * background and not the lighting, the environment probe being the only thing
 * lighting a metal surface, and `npm run light:check` printing resolved hex.
 * Nothing here is a number invented to make the story better.
 */
export default function Post() {
  return (
    <>
      <p>
        I changed the sky to night and the reasoning was one sentence long: it
        will be a little dimmer. The next build rendered every chrome rail on
        Neon Circuit as pure black, and it took me longer than I want to admit
        to work out why.
      </p>

      <h2>What actually happened</h2>
      <p>
        The sky in this game is a gradient dome with a starfield, a moon and
        fog matched to the horizon. When I swapped the daytime gradient for a
        dark blue one I was thinking about the picture. What I had not thought
        about was that the dome was also generating the environment probe — the
        thing that tells a reflective material what it can see.
      </p>
      <p>
        For a matte block that barely matters. A matte surface takes most of
        its light from the directional and ambient lights, so a darker
        surrounding does something subtle to it. For a metal surface it matters
        completely, because a metal surface has almost no diffuse response at
        all: what it looks like <em>is</em> what it is reflecting. Make the
        surroundings black and a chrome rail is black. Not dark. Black.
      </p>
      <p>
        The number I eventually measured was that overall light had dropped to
        about a seventh of what it had been. My estimate had been &ldquo;a
        little dimmer&rdquo;. That gap — between a reasoned guess and a
        measurement — is the whole post really.
      </p>

      <h2>The fix that was worse</h2>
      <p>
        My first fix was to add a strong fill light tinted to the new sky, so
        the metals had something to reflect again. It worked, in the narrow
        sense that the rails stopped being black. It also turned the entire
        world blue.
      </p>
      <p>
        This is where I had to stop and decide what the night was actually for,
        because I had been treating two separate things as one. The night is
        the background. It tells you what time it is. It is not the lighting
        rig, and it should not be, because every course and every palette
        colour in this game was authored under a specific rig — and the whole
        subject of the game is the colours somebody placed, block by block. A
        rig that shifts every colour toward blue is not a mood. It is a
        modification of the content.
      </p>
      <p>
        Film does this properly and has for decades: the background tells you
        it is night, the subject stays the colour it is. So the rule I settled
        on is that the night sky is a backdrop with a starfield and a moon in
        it, the lighting values are the studio rig unchanged, and the moon sits
        exactly where the sun offset already pointed so the shadows fall where
        they always fell. Three attempts to arrive at one sentence.
      </p>

      <h2>The tool that came out of it</h2>
      <p>
        The part I would keep if I had to throw the rest away is a script:{" "}
        <code>npm run light:check</code>. It resolves the lighting for a scene
        and prints the actual values — hex colours, intensities, the lot.
      </p>
      <p>
        That sounds unexciting and it is the most useful thing I built that
        week. The bug was not that I made a bad decision; it was that I made a
        decision about a number by describing it in words. &ldquo;A little
        dimmer&rdquo; and &ldquo;a seventh of the light&rdquo; are the same
        sentence in English and very different facts. Once the check prints hex
        values, a colour cast stops being a feeling I might notice on a good
        monitor and becomes a number I can compare to last week&apos;s.
      </p>
      <p>
        I have since written two more scripts in the same shape — one that
        measures every course and one that walks them for reachability — for
        the same reason. Anything I would otherwise reason about in adjectives,
        I would rather print.
      </p>

      <h2>What I would tell myself</h2>
      <p>
        Three things, and only the last one is about graphics.
      </p>
      <p>
        If a change affects something that is computed from a scene rather than
        set on it, you are changing more than you think. The environment probe
        was downstream of the sky, and nothing in the code said so loudly
        enough for me to notice.
      </p>
      <p>
        When a fix works but something else looks wrong, the fix is usually
        wrong too. The blue world was telling me I had misunderstood the
        problem, not that I needed to tune the fill light.
      </p>
      <p>
        And if you find yourself estimating a value in adjectives, write the
        script. It is nearly always shorter than the debugging session it
        replaces.
      </p>
    </>
  );
}
