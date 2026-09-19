/**
 * Post 2. The material is the jump-arc design rules in `lib/jump-arc.ts`, the
 * reachability and checkpoint tests in `courses.test.ts`, and the medal
 * derivation in `lib/medals.ts` — all of which are in the repository and all
 * of which the guide pages depend on being true.
 *
 * The constants are described rather than pasted, so this post cannot go
 * stale the way a hand-folded number does. `/how-courses-are-made` imports
 * them and is the page that states them.
 */
export default function Post() {
  return (
    <>
      <p>
        There are twenty-three parkour courses on this site and I did not place
        a single jump by eye. Not because I am rigorous, but because the first
        few I did place by eye were unfair in ways I could not see from inside
        the editor, and building the tooling turned out to be less work than
        re-testing the levels every time I touched the movement.
      </p>

      <h2>The jump is asymmetric, which breaks the obvious formula</h2>
      <p>
        The character falls three times faster than it rises. That is the
        single biggest lever on how a platformer feels — it is why the jump has
        a snap to it rather than a float — and it has an awkward consequence
        for level design: the textbook airtime formula assumes one gravity, and
        with a fall scale of three it is wrong by roughly 40%.
      </p>
      <p>
        Forty percent is not a rounding error. It is the difference between a
        gap you clear comfortably and one you cannot clear at all. So the arc
        is computed from the movement config rather than written into a
        comment, and every course is built against the computed value.
      </p>
      <p>
        The version of this that nearly shipped was a sentence in a source file
        saying roughly &ldquo;with this jump velocity the character rises about
        one and a half units, so every rise is at most one cell and every gap
        at most two&rdquo;. That was true when it was written. It is a constant
        folded by hand, and the failure mode is horrible: change the jump, the
        comment stays, the courses stay, and some of them quietly become
        impossible. Nothing fails. Nobody finds out until a player cannot make
        the fourth jump.
      </p>

      <h2>Twenty percent is the difference between hard and unfair</h2>
      <p>
        No course is allowed to ask for a jump at the full computed reach. They
        are built against 80% of it.
      </p>
      <p>
        The reason is that a jump designed at 100% is one you make by leaving
        the platform on the last available frame at exactly full speed. That is
        a frame-perfect input, and asking for a frame-perfect input is fine
        once in a boss fight and ruinous for a move the game asks for a hundred
        times in a run. The remaining 20% is not slack. It is the entire
        difference between a course that is hard and one that is unfair.
      </p>
      <p>
        My Expert courses spend that margin. They are supposed to feel like
        they are on the limit, and they are — of what the design rules allow.
        The safety underneath it is not spent by anything, because it is also
        absorbing an optimism in the model: the arc assumes you keep full
        horizontal speed through the air, and air control in this game is 0.15,
        so somebody who takes off slow stays slow.
      </p>

      <h2>The unit is empty cells, and getting that wrong is how you break a course</h2>
      <p>
        This sounds like pedantry and it is the thing I got wrong most often.
      </p>
      <p>
        A gap is measured in <em>empty cells between platforms</em>, not centre
        to centre. Two pads three cells apart have two cells of air between
        them. The character takes off at the leading edge of one pad and lands
        on the leading edge of the next, so two cells of air is what has to be
        flown, not three.
      </p>
      <p>
        Confuse the two and every jump in the course is one cell harder than
        you designed it. That is enough, at the top of the ladder, to turn a
        deliberate jump into a frame-perfect one — by accident, invisibly,
        across a whole level.
      </p>

      <h2>Every course is proved finishable, including from every checkpoint</h2>
      <p>
        A course gets turned into a graph: every surface you can stand on is a
        node, and there is an edge wherever the arc says one can be reached
        from another. A test walks that graph and refuses to ship a course
        where the goal cannot be reached from the spawn.
      </p>
      <p>
        That much is obvious. The check I would actually recommend to anyone
        building a platformer is the second one: the goal has to still be
        reachable <em>from every checkpoint</em>.
      </p>
      <p>
        A checkpoint you cannot continue from is not a mercy, it is a soft
        lock. The run is alive, the clock is running, and the course is over —
        and unlike an unfinishable course, it only happens to the players who
        already made a mistake, which is the worst possible group to do it to.
        I have shipped exactly one of those and only because I found it before
        anyone else did.
      </p>

      <h2>The medal times are measurements, not targets</h2>
      <p>
        The same graph gets solved for its cheapest route: walking edges cost
        distance over run speed, jump edges cost their airtime. The result is a
        hard physical floor — it assumes instant acceleration, perfect pathing,
        and never looking at where it is going.
      </p>
      <p>
        Nobody will ever match that time. It is not a target, it is a
        measurement of the course. The Author time is that floor multiplied by
        a single constant for how much slower a very good human is, and the
        other three medals are multiples of the Author time.
      </p>
      <p>
        I want to be straight about which part of this is a guess. The
        constant is. It is one number representing an assumption about human
        play that I have no data for yet, and it is written down in the source
        as the least defensible thing in the file. What the derivation buys me
        is not accuracy — it is that a medal can never be <em>impossible</em>,
        because it is anchored to a route the geometry admits, and that it
        cannot silently rot, because moving one pad moves the floor and the
        test fails with the new value.
      </p>
      <p>
        When there is real play data, that constant is the one thing that has
        to change, in one place, for every course at once.
      </p>
    </>
  );
}
