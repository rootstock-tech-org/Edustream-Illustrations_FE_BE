"""
The training programs a new worker can be allotted.

Demonstration content, and deliberately a constant: the programs are part of
the product's story, not operator data, so there is nothing to store and
nothing to migrate. Each program is a handful of short sections a worker
reads on a phone, and a five-question check on what the sections said.

The answer key lives here and must never leave the server: the portal
endpoint strips it before sending a program to a browser, and grading is done
server-side against this file. A quiz whose answers ride along in the payload
is a quiz in name only.

The subjects echo what the dashboard itself watches — PPE, restricted zones,
walkways, suspended loads — so a demo of the training and a demo of the
monitoring tell one story about the same floor.
"""

#: Right answers out of five a worker needs to pass.
PASS_MARK = 3

#: The share of the quiz that makes a worker "Skilled" on the Status page.
#:
#: Named once and derived from the score rather than folded into PASS_MARK,
#: so the day the quiz grows past five questions the two rules keep their
#: own meanings. Today they coincide: 3 of 5 is both the pass and 60%.
SKILL_THRESHOLD = 0.6

PROGRAMS = [
    {
        "id": "safety-induction",
        "name": "General Safety Induction",
        "summary": (
            "The site rules every new worker learns before their first "
            "shift: what to wear, where not to stand, and how to raise a "
            "hazard."
        ),
        "sections": [
            {
                "title": "Welcome and site rules",
                "body": (
                    "Welcome to the plant. Three rules apply everywhere, to "
                    "everyone, on every shift: follow the marked routes, "
                    "wear the protective gear your area requires, and if "
                    "you are unsure whether something is safe — stop and "
                    "ask your supervisor. No job on this floor is so urgent "
                    "that it cannot wait for that question."
                ),
            },
            {
                "title": "Protective gear",
                "body": (
                    "A helmet and a high-visibility vest are mandatory on "
                    "the production floor at all times. Gloves are required "
                    "at any station handling sheet metal, chemicals or hot "
                    "work. Damaged gear is replaced free at the store — "
                    "wearing a cracked helmet protects nobody, and cameras "
                    "on this site check for missing gear automatically."
                ),
            },
            {
                "title": "Restricted zones and walkways",
                "body": (
                    "Areas marked with red floor paint or barrier tape are "
                    "restricted: machinery moves there without warning, and "
                    "entering one raises an alarm. Green-marked walkways "
                    "are for people; keep them clear — a pallet left on a "
                    "walkway forces the next person out among the "
                    "forklifts. Some areas are also closed at set hours; a "
                    "posted curfew means nobody enters, anywhere in view."
                ),
            },
            {
                "title": "Emergency exits and assembly",
                "body": (
                    "Learn the two exits nearest your station on your "
                    "first day — the nearest one may be blocked by the "
                    "very incident you are escaping. When the alarm "
                    "sounds, leave by the nearest clear exit and walk to "
                    "the assembly point in the front yard. Never use lifts, "
                    "never go back for belongings, and stay at assembly "
                    "until your name is checked."
                ),
            },
            {
                "title": "Reporting hazards",
                "body": (
                    "A near miss reported today is an injury prevented "
                    "next week. Report spills, damaged guards, blocked "
                    "exits or unsafe behaviour to your supervisor at once "
                    "— or use the hazard book at the shift office. Nobody "
                    "is ever penalised for reporting a hazard, including "
                    "one they caused."
                ),
            },
        ],
        "quiz": [
            {
                "question": "When are a helmet and high-visibility vest required on the production floor?",
                "options": [
                    "Only when a supervisor is present",
                    "At all times",
                    "Only during machine operation",
                    "Only on night shifts",
                ],
                "answer": 1,
            },
            {
                "question": "What does red floor paint or barrier tape mean?",
                "options": [
                    "Storage area for finished goods",
                    "Walkway for visitors",
                    "A restricted zone you must not enter",
                    "Wet floor being cleaned",
                ],
                "answer": 2,
            },
            {
                "question": "The evacuation alarm sounds. What do you do?",
                "options": [
                    "Collect your belongings, then leave",
                    "Take the lift to the ground floor",
                    "Wait at your station for instructions",
                    "Leave by the nearest clear exit and go to the assembly point",
                ],
                "answer": 3,
            },
            {
                "question": "You saw a near miss but nobody was hurt. What should you do?",
                "options": [
                    "Report it to your supervisor or the hazard book",
                    "Nothing — no injury means no report",
                    "Mention it at the next monthly meeting",
                    "Only report it if a machine was damaged",
                ],
                "answer": 0,
            },
            {
                "question": "You are not sure whether a task is safe. What is the site rule?",
                "options": [
                    "Do it quickly and carefully",
                    "Stop and ask your supervisor",
                    "Ask a colleague to do it instead",
                    "Try it once and see",
                ],
                "answer": 1,
            },
        ],
    },
    {
        "id": "fire-safety",
        "name": "Fire Safety & Emergency Response",
        "summary": (
            "What starts fires in a factory, which extinguisher to reach "
            "for, and how an evacuation is meant to go."
        ),
        "sections": [
            {
                "title": "How factory fires start",
                "body": (
                    "Most plant fires begin small: overloaded sockets, "
                    "oily rags left near hot work, sparks from grinding "
                    "landing in dust. Good housekeeping is fire "
                    "prevention — waste in the bins, flammables in the "
                    "store, hot-work permits before any cutting or "
                    "welding."
                ),
            },
            {
                "title": "Choosing an extinguisher",
                "body": (
                    "Water (red) is for wood, paper and cloth — never "
                    "electrical or oil fires. Foam (cream) covers "
                    "flammable liquids. CO2 (black) is the one for "
                    "electrical fires. Dry powder (blue) works on most "
                    "fires and is what you will find beside the panels. "
                    "When in doubt, raise the alarm and leave — the "
                    "building is insured, you are not replaceable."
                ),
            },
            {
                "title": "Using one: PASS",
                "body": (
                    "Pull the pin. Aim at the base of the fire, not the "
                    "flames. Squeeze the handle. Sweep side to side. "
                    "Fight a fire only while it is smaller than you, "
                    "your exit is behind you, and the alarm has already "
                    "been raised."
                ),
            },
            {
                "title": "Evacuation",
                "body": (
                    "On the alarm: stop work, switch off your machine if "
                    "that takes seconds, and walk — do not run — by the "
                    "nearest clear exit to the assembly point. Close "
                    "doors behind you. Report anyone you know is missing "
                    "to the fire warden at assembly; never re-enter to "
                    "search yourself."
                ),
            },
        ],
        "quiz": [
            {
                "question": "Which extinguisher is right for an electrical panel fire?",
                "options": [
                    "Water (red)",
                    "Foam (cream)",
                    "CO2 (black)",
                    "A wet blanket",
                ],
                "answer": 2,
            },
            {
                "question": "In PASS, where do you aim the extinguisher?",
                "options": [
                    "At the top of the flames",
                    "At the base of the fire",
                    "At the smoke",
                    "Above the fire, letting it fall",
                ],
                "answer": 1,
            },
            {
                "question": "When is it acceptable to fight a fire yourself?",
                "options": [
                    "Whenever an extinguisher is within reach",
                    "Only after the alarm is raised, the fire is small, and your exit is behind you",
                    "Only at night when fewer people are on site",
                    "Never — extinguishers are for the fire brigade",
                ],
                "answer": 1,
            },
            {
                "question": "A colleague is missing at the assembly point. What do you do?",
                "options": [
                    "Go back inside and search for them",
                    "Wait ten minutes, then go back in",
                    "Report it to the fire warden immediately",
                    "Call their phone and keep waiting",
                ],
                "answer": 2,
            },
            {
                "question": "Which of these is fire prevention?",
                "options": [
                    "Keeping oily rags in a closed metal bin",
                    "Storing solvents beside the welding bay",
                    "Running three machines from one socket",
                    "Skipping the hot-work permit for a small job",
                ],
                "answer": 0,
            },
        ],
    },
    {
        "id": "machine-safety",
        "name": "Machine & Equipment Safety",
        "summary": (
            "Working beside machines that can hurt you: isolation before "
            "maintenance, guards in place, and staying out from under "
            "loads."
        ),
        "sections": [
            {
                "title": "Lockout, tagout",
                "body": (
                    "Before any cleaning, clearing or repair, the machine "
                    "is isolated: power locked off with your own lock, "
                    "tagged with your name, and tested dead before hands "
                    "go anywhere near it. Only the person who fitted a "
                    "lock removes it. A jammed machine that restarts with "
                    "an arm inside it is the injury this rule exists to "
                    "prevent."
                ),
            },
            {
                "title": "Guards stay on",
                "body": (
                    "Guards are part of the machine, not an accessory. A "
                    "machine with a missing or bypassed guard is out of "
                    "service — report it, tag it, and do not run it. "
                    "Never reach over, under or around a guard while a "
                    "machine is moving."
                ),
            },
            {
                "title": "Forklifts and people",
                "body": (
                    "Forklifts and people are kept apart by the floor "
                    "markings: vehicles in the marked lanes, people on "
                    "the walkways. Make eye contact with the driver "
                    "before crossing a lane — a loaded forklift's driver "
                    "may not see you at all. Some zones are marked "
                    "vehicle-free; a forklift standing in one raises an "
                    "alarm."
                ),
            },
            {
                "title": "Suspended loads",
                "body": (
                    "Never walk or stand under a suspended load, and "
                    "never let one be lifted over people. The lifting "
                    "area is marked; while a crane or hoist is working, "
                    "that area belongs to the load. A dropped load gives "
                    "no warning — the only protection is not being "
                    "there."
                ),
            },
            {
                "title": "Housekeeping around machines",
                "body": (
                    "Keep machine surrounds clear: swarf in the bins, "
                    "tools on the shadow board, cables off the floor. "
                    "Most machine-area injuries are slips and trips on "
                    "the way to or from the machine, not the machine "
                    "itself."
                ),
            },
        ],
        "quiz": [
            {
                "question": "A machine jams mid-cycle. Before clearing it you must:",
                "options": [
                    "Switch it to low speed",
                    "Ask a colleague to watch the start button",
                    "Lock off the power with your own lock, tag it, and test it dead",
                    "Wait for the jam to clear itself",
                ],
                "answer": 2,
            },
            {
                "question": "Who may remove a lockout lock?",
                "options": [
                    "Any supervisor",
                    "Only the person who fitted it",
                    "Whoever needs the machine next",
                    "The maintenance manager",
                ],
                "answer": 1,
            },
            {
                "question": "A guard is missing from a running machine. The machine is:",
                "options": [
                    "Fine to use carefully until the end of shift",
                    "Fine if you keep your hands clear",
                    "Out of service — report it and do not run it",
                    "Fine for experienced operators only",
                ],
                "answer": 2,
            },
            {
                "question": "A crane is moving a load across the bay. You should:",
                "options": [
                    "Walk quickly underneath before it gets close",
                    "Stay out of the marked lifting area until the load is down",
                    "Stand under it to guide the operator",
                    "Continue working directly below it",
                ],
                "answer": 1,
            },
            {
                "question": "Before crossing a forklift lane you should:",
                "options": [
                    "Make eye contact with the driver, then cross",
                    "Run across to spend less time in the lane",
                    "Cross anywhere the load looks small",
                    "Whistle and cross without looking",
                ],
                "answer": 0,
            },
        ],
    },
]

#: The programs by id, for lookups.
PROGRAMS_BY_ID = {program["id"]: program for program in PROGRAMS}


def public_program(program_id: str) -> dict:
    """
    A program as the worker portal may see it: the answer key stripped.

    Grading happens server-side against PROGRAMS_BY_ID; what leaves the
    server is the questions and their options only.
    """
    program = PROGRAMS_BY_ID[program_id]

    return {
        "id": program["id"],
        "name": program["name"],
        "summary": program["summary"],
        "sections": [dict(section) for section in program["sections"]],
        "quiz": [
            {"question": q["question"], "options": list(q["options"])}
            for q in program["quiz"]
        ],
        "pass_mark": PASS_MARK,
    }
