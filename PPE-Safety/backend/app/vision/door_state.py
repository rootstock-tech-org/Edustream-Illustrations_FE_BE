"""
What a door is believed to be doing, and what it takes to believe it.

The model reads a door's state off a single frame, and on the office
reference footage it changed its mind several times a second — partly because
glass partitions are genuinely ambiguous, partly because "open" scored lower
than "closed" (0.58 against 0.71) and dipped under the threshold. So a door's
reported state is not the last thing the model said about it. It is what the
recent sightings say by majority.

That rule used to live in the door service, and it only ever answered one of
the two questions it looked like it answered. It resisted **change**: three
sightings of the new state, twice as many as of the state being replaced,
held for `STATE_CONFIRM_SECONDS`. It did not resist **arrival**. The first
sighting of a door was believed outright, on the reasoning that the vote
exists to stop a state bouncing off the previous one and there is no previous
one.

Measured, that reasoning cost two things.

    A glass office door, visually verified shut for all 375 frames of the
    reference clip, is called open by the detector in 303 of them and closed
    in 5. The module believed "open" at t=0.20s — the first sighting — and
    never once said "closed" in twenty-five seconds. Severity reached "low"
    at 3.27s and "medium" by 12.27s: an uninterrupted, escalating alert about
    a door that is never open.

    And a perfect 50/50 alternation never changed its settled state once over
    60 to 120 ticks. It locked to whichever side happened to arrive first,
    from either side. A 70/30 stream flipped in 1.4s, so the pathology was
    specific to the genuinely ambiguous case — which is exactly what this
    module's own comments call the doors it is worst at.

Both are the same missing idea, so both are answered in one place: a first
belief clears the same bar a change does, and a doorway whose evidence stays
a coin flip is reported as `UNRELIABLE` rather than committed to.

`unreliable` is a fourth per-door state alongside open, closed and not-seen-
yet. It is **not an alert** and **not an answer**. It says the camera cannot
read that doorway, which is a different problem from a door being open and
needs a different action — somebody to look at the marking, the angle or the
lens.

## What the first-belief bar does not fix

It is worth writing down what this cannot reach, because the glass door is
the defect it was written for and the glass door survives it. The detector is
not *undecided* about that doorway, it is *wrong*: 303 open against 5 closed,
at a mean confidence of 0.700. No majority rule can rescue an opinion that
consistent. Measured over the clip, the bar delays the false belief and the
false alarm with it, and that is all it does. The rest of that defect is the
weights, not this file.

Here, split is measured over the window rather than assumed from a single
disagreement, for the same reason: on the same clip the two wooden doors
contradict themselves in the same frame 4.7% and 0.0% of the time they are
seen at all, and neither is a doorway anybody should be told is unreadable.
"""

from typing import Any, Optional

__all__ = [
    "UNRELIABLE",
    "STATE_CONFIRM_SECONDS",
    "STATE_WINDOW_SECONDS",
    "MIN_CONFIRM_SIGHTINGS",
    "CONFIRM_MAJORITY",
    "SPLIT_FOR_SECONDS",
    "STARVED_AFTER_SECONDS",
    "observe",
    "settle",
    "starved",
]

#: A doorway whose recent sightings are an even argument between open and
#: closed. Reported in a door's `state`, beside "open", "closed" and None.
UNRELIABLE = "unreliable"

#: How long a state must hold before it is believed, in seconds.
#:
#: Raw detections flicker. Without this, every flicker restarted the timer and
#: a door that really was open would never accumulate enough time to raise
#: anything.
#:
#: Measured in seconds rather than frames so it behaves the same whether the
#: pipeline is keeping up or dropping frames.
STATE_CONFIRM_SECONDS = 0.8

#: How long a door's recent sightings are kept for the vote, in seconds.
#:
#: Long enough to hold several sightings even when the model only finds the
#: door in some frames, short enough that the evidence is about now.
STATE_WINDOW_SECONDS = 2.5

#: How many sightings of a state are needed before it is believed.
#:
#: The confirmation window alone was not enough, because it only ever asked
#: whether a state had been *contradicted* — and this model reports nothing at
#: all for a door in many frames. One spurious "open" followed by silence was
#: therefore never argued with, and a closed office door raised "open 3
#: seconds" on the operator's screen.
#:
#: Evidence has to be positive: several sightings, more of them than of
#: whatever they are displacing. The model is unstable enough to need it — on
#: the office footage its reading of the same frame changed with nothing more
#: than a different JPEG quality, so no single frame, and no unargued silence,
#: should be allowed to move a door. Or, now, to establish one.
MIN_CONFIRM_SIGHTINGS = 3

#: Two to one, not a bare majority.
#:
#: This model alternates between open and closed on genuinely ambiguous views,
#: and an even split is not evidence of anything. Named rather than written as
#: a `* 2` in two places, because the same ratio decides both questions here:
#: what is enough to believe a state, and what is too even to believe either.
CONFIRM_MAJORITY = 2

#: How long a doorway may go on being sighted without ever confirming before
#: the module says so, in seconds.
#:
#: The bar above asks for MIN_CONFIRM_SIGHTINGS inside STATE_WINDOW_SECONDS,
#: which is a rate — 1.2 sightings a second — and not every doorway clears it.
#: Measured on the factory clip, the model finds one marked doorway in 72.8% of
#: frames and another in 2.7%; the first confirms in 0.8s and the second, at a
#: delivered 3fps, never does.
#:
#: Never confirming is a defensible answer. Reporting it as "not seen yet" is
#: not, and that is what happened: `state` stays None, which is also what a
#: doorway marked one second ago looks like, so a box the module has been
#: staring at for a minute and a box nobody has reached yet were shown with the
#: same words. That is the defect this whole module is named for, arriving from
#: the other side — the product asserting something it has not established.
#:
#: Four windows, so a doorway that is merely slow to confirm is never called
#: starved: the slowest doorway on that clip that does eventually settle takes
#: 8.8s at 10fps, and anything past this is genuinely not accumulating.
STARVED_AFTER_SECONDS = 4 * STATE_WINDOW_SECONDS

#: How long the evidence must stay evenly split before the doorway is called
#: unreliable, in seconds.
#:
#: A door that genuinely changes also produces a window holding both states,
#: so the two have to be told apart, and the thing that tells them apart is
#: how long it lasts. A clean change confirms `STATE_CONFIRM_SECONDS` after
#: the new state first appears, and confirming empties the window of the old
#: state's sightings — so a real change is settled well before its own
#: disagreement could be mistaken for a coin flip. Measured on an even stream
#: either side of a change, the window is only ever balanced enough to count
#: as split between 0.83s and 1.67s after it.
#:
#: A full window is therefore comfortably clear of a genuine change, and it is
#: the honest phrasing of what is being claimed: split for as long as this
#: module can remember.
SPLIT_FOR_SECONDS = STATE_WINDOW_SECONDS


def _recent(state: dict[str, Any], now: float, window: Optional[float]) -> list:
    """
    This doorway's sightings that are still inside the window.

    The window is `STATE_WINDOW_SECONDS` unless the caller has measured the
    stream and found frames arriving too slowly for three of them to fit — see
    app/vision/cadence.py. It only ever widens, so a stream at three frames a
    second or better prunes exactly as it always did.
    """
    if window is None:
        window = STATE_WINDOW_SECONDS

    return [seen for seen in state.get("history", []) if now - seen[0] <= window]


def _supporting(history: list, observed: str) -> list[float]:
    """When, inside the window, this state was seen."""
    return [when for when, seen in history if seen == observed]


def _confirmed(history: list, observed: str, now: float) -> bool:
    """
    Whether the window's sightings are enough to believe `observed`.

    The same three tests whether there is a state to displace or not. That is
    the whole of this phase's first half: a state arriving at a doorway
    nobody has read yet used to be believed on one sighting, and a state
    arriving at a doorway that already had one had to clear all three. There
    was never a reason for the difference — a model wrong on frame one is
    wrong in exactly the way the vote was built to catch.
    """
    supporting = _supporting(history, observed)

    if len(supporting) < MIN_CONFIRM_SIGHTINGS:
        return False

    # Only what has been seen *since the door started looking different*
    # counts against it. A door that has been shut all morning has a window
    # full of "closed", and making an opening out-vote its own history would
    # mean the longer a door had been shut the longer it took to notice it
    # opening — which is backwards.
    against = sum(
        1 for when, seen in history if seen != observed and when >= supporting[0]
    )

    return (
        len(supporting) >= against * CONFIRM_MAJORITY
        and now - supporting[0] >= STATE_CONFIRM_SECONDS
    )


def _split(history: list) -> bool:
    """
    Whether the window is an even argument rather than evidence.

    Measured over the whole window, unlike the count in `_confirmed` above,
    which deliberately ignores everything before the candidate first appeared.
    The two are asking different questions: that one asks whether a state has
    been contradicted since it turned up, this one asks whether the doorway as
    a whole has been telling us anything. A door mid-change satisfies the
    first and should; only a door that goes on disagreeing with itself
    satisfies this one for long.

    Both sides need `MIN_CONFIRM_SIGHTINGS` before either counts. Reusing the
    module's own "several sightings, not one" bar rather than inventing a
    second number: one stray contradiction is the flicker the vote already
    exists to absorb, and calling a doorway unreadable on the strength of it
    would replace one confident wrong answer with another.
    """
    counts: dict[str, int] = {}

    for _, seen in history:
        counts[seen] = counts.get(seen, 0) + 1

    if len(counts) < 2:
        return False

    fewest = min(counts.values())
    most = max(counts.values())

    return fewest >= MIN_CONFIRM_SIGHTINGS and fewest * CONFIRM_MAJORITY > most


def starved(state: dict[str, Any], now: float) -> bool:
    """
    Whether this doorway is being sighted but never often enough to settle.

    Distinguishes the two things an unsettled door can mean. A doorway nobody
    has managed to look at yet has no `looking_since` and is genuinely "not
    seen yet". A doorway that has been sighted repeatedly for
    STARVED_AFTER_SECONDS and still has no state is not waiting for a first
    look — it is one the model finds too seldom for the sightings ever to fall
    close enough together, and it will still be unsettled in an hour.

    Says nothing about whether the door is open. It is deliberately not a
    state: `state` stays None, nothing escalates, and no timer starts. This
    only changes which of two true sentences the operator is shown.
    """
    return (
        state.get("state") is None
        and state.get("looking_since") is not None
        and now - state["looking_since"] >= STARVED_AFTER_SECONDS
    )


def observe(
    state: dict[str, Any],
    observed: str,
    now: float,
    only_frame: bool = False,
    window: Optional[float] = None,
) -> None:
    """
    Fold one sighting into a door's remembered state.

    A door changes state when the sightings say so by majority, and now takes
    its first state on the same terms — not on whichever frame the model
    happened to speak on first. Where the sightings go on contradicting each
    other the door is reported unreliable instead, because the alternative
    measured on this footage is a coin flip that is never revisited.

    Kept in one place because every kind of door has to answer the question
    the same way, and each used to carry its own copy of a weaker rule.

    Args:
        state: the door's memory — `state`, `since`, `history` and
            `split_since`. Updated in place. Missing keys are tolerated, so a
            caller that built the dict before this file existed still works.
        observed: what the model says this doorway is, right now.
        now: the time of this sighting, in seconds.
        only_frame: there will be no second sighting — an uploaded photograph
            rather than a camera. A bar that asks for three sightings over
            0.8s is unmeetable in one still, and the honest answer to "what
            does this picture show" is what the picture shows. Nothing
            escalates from a still: there is no duration, so no severity and
            no alert, which is the whole of what the bar exists to hold back.
    """
    # When this doorway was first sighted at all, kept for as long as the
    # region is. Deliberately not aged out with the window: the question it
    # answers is "how long have we been trying", and a doorway sighted too
    # rarely to confirm is exactly one whose window keeps emptying.
    if state.get("looking_since") is None:
        state["looking_since"] = now

    history = _recent(state, now, window)
    history.append((now, observed))
    state["history"] = history

    settled: Optional[str] = state.get("state")

    # Neither "not seen yet" nor "unreliable" is a state anything has to argue
    # its way past. The second is a statement about the evidence rather than
    # about the door: the moment one side can carry the ordinary bar, it does,
    # and it does not have to out-vote the module's own admission that it
    # could not tell.
    held = settled if settled not in (None, UNRELIABLE) else None

    if only_frame and held is None:
        state["state"] = observed
        state["since"] = now
        state["split_since"] = None
        return

    _decide(state, history, now, window, prefer=observed)


def settle(
    state: dict[str, Any],
    now: float,
    window: Optional[float] = None,
) -> None:
    """
    Ask the question again on a frame where this doorway was not sighted.

    The bar has three parts — enough sightings, a majority, and
    STATE_CONFIRM_SECONDS elapsed since the first of them — and only the
    third is about the passage of time. Asking it solely on frames where the
    model happened to find the doorway meant evidence could satisfy the bar
    and never be looked at again.

    Measured on the factory clip: a doorway found in 2.7% of frames got its
    three sightings at 27.6s, 27.8s and 28.0s — count met, majority met, and
    0.4s short of the elapsed test at the moment the last one landed. Nothing
    asked again until the next sighting 2.2s later, by which point the window
    had begun dropping the very sightings that would have carried it. The
    evidence was there and the module simply was not listening.

    The same is true of the split: a doorway that becomes a coin flip and then
    stops being found would never have been called unreliable, because that
    clock is only read here too.

    Nothing is believed on less than before. This adds no sighting and moves
    no bar; it re-reads a window that has already been collected, on the frames
    between sightings, which is exactly when the elapsed part of the bar comes
    good.
    """
    if not state.get("history"):
        # Never sighted, or the window has emptied. Either way there is
        # nothing to reconsider, and clearing the split clock is the whole of
        # what is left to do.
        state["split_since"] = None
        return

    history = _recent(state, now, window)
    state["history"] = history

    _decide(state, history, now, window)


def _decide(
    state: dict[str, Any],
    history: list,
    now: float,
    window: Optional[float] = None,
    prefer: Optional[str] = None,
) -> None:
    """
    Believe a state, withdraw one, or leave the doorway as it is.

    `prefer` is the state just sighted, tried first so a live stream behaves
    exactly as it did. The other candidates in the window are then tried in
    turn, which is what lets a frame with no sighting finish an argument that
    an earlier frame had already won — each still has to clear the same bar
    against the same history.
    """
    settled: Optional[str] = state.get("state")
    held = settled if settled not in (None, UNRELIABLE) else None

    candidates = []
    if prefer is not None:
        candidates.append(prefer)
    for _when, seen in history:
        if seen not in candidates:
            candidates.append(seen)

    for candidate in candidates:
        if candidate == held or not _confirmed(history, candidate, now):
            continue

        supporting = _supporting(history, candidate)

        state["state"] = candidate

        # Changed when the new state was first seen, not when we finished
        # being convinced by it, or every timer under-reports — a door open
        # for three seconds would only ever be reported as open for two. True
        # of a first belief too, so the bar above costs nothing at all on a
        # threshold longer than the bar itself.
        state["since"] = supporting[0]

        # The sightings that argued for the state just left must not still be
        # on file to argue it straight back — nor to look, a moment later,
        # like a doorway that cannot make its mind up.
        state["history"] = [(when, candidate) for when in supporting]
        state["split_since"] = None
        return

    if not _split(history):
        state["split_since"] = None
        return

    since = state.get("split_since")

    if since is None:
        # `is None`, not a truth test: a clock that legitimately reads 0.0 is
        # a real time, and the workstation module froze an absence timer for
        # ever by asking the other way.
        since = now
        state["split_since"] = since

    # As long as the module can remember, which on a slow link is longer than
    # the constant — the window and this clock are the same claim about how
    # far back the evidence goes, and they have to widen together or a slow
    # stream would call every real change a coin flip.
    split_for = window if window is not None else SPLIT_FOR_SECONDS

    if settled != UNRELIABLE and now - since >= split_for:
        # Withdrawing a settled state, not only refusing to reach one. A door
        # that has become a coin flip is a door nobody knows the state of, and
        # this module's own rule elsewhere is that a confident wrong "closed"
        # is the worst of the three answers — which is what leaving the old
        # belief in place would eventually produce.
        #
        # It cuts the other way too, and that is the cost: an alert on a door
        # that really is open is withdrawn if the detector starts disagreeing
        # with itself about it for two and a half seconds. What the operator
        # gets instead is a doorway that says it cannot be read, which is a
        # reason to go and look rather than a reason to relax.
        state["state"] = UNRELIABLE
        state["since"] = now
