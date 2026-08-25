// ═══════════════════════════════════════════════════════════
//  STORY DATA — scenes, characters, dialogue and events
//  Edit this file for anything narrative: walkable maps, interactions,
//  choices, dialogue lines and objectives.
//  A dialogue page may carry `objective: "..."` to set the HUD objective
//  the moment that line appears.
// ═══════════════════════════════════════════════════════════

// ── Scenes ─────────────────────────────
// Each scene has its own background, walkable cells and spawn cell.
const SCENES = {
  'scene-1': {
    background: 'assets/room1.png',
    spawn: { col: 23, row: 9 },
    walkable: "C6R6C7R6C8R6C6R7C7R7C8R7C6R8C7R8C8R8C6R9C7R9C8R9C6R10C7R10C8R10C6R11C7R11C8R11C6R12C7R12C8R12C6R13C7R13C8R13C6R14C7R14C8R14C6R15C7R15C8R15C9R15C10R15C11R15C12R15C13R15C14R15C15R15C16R15C17R15C18R15C19R15C20R15C21R15C22R15C23R15C24R15C25R15C26R15C27R15C9R7C9R8C9R9C9R10C9R11C9R12C9R13C9R14C6R5C4R7C5R7C9R7C10R7C11R7C12R7C13R7C14R7C15R7C16R7C17R7C18R7C19R7C20R7C21R7C22R7C23R7C24R7C25R7C26R7C27R7C9R8C10R8C11R8C12R8C13R8C14R8C15R8C16R8C17R8C18R8C19R8C20R8C21R8C22R8C23R8C24R8C25R8C26R8C27R8C11R6C12R6C13R6C14R6C15R6C16R6C17R6C18R6C19R6C20R6C21R6C16R5C17R5C18R5C19R5C20R5C21R5C17R4C18R4C19R4C21R5C21R6C21R7C21R8C20R7C21R7C22R7C23R7C24R7C25R7C26R7C20R8C21R8C22R8C23R8C24R8C25R8C26R8C17R14C18R14C19R14C20R14C21R14C22R14C23R14C24R14C25R14C16R6C17R6C18R6C19R6C20R6C16R7C17R7C18R7C19R7C20R7C16R8C17R8C18R8C19R8C20R8C16R9C17R9C18R9C19R9C20R9C16R10C17R10C18R10C19R10C20R10C16R11C17R11C18R11C19R11C20R11C16R12C17R12C18R12C19R12C20R12C17R13C18R13C19R13C20R13C17R14C18R14C19R14C20R14C21R9C22R9C23R9C24R9C13R13C14R13C13R14C14R14C13R10C13R11C13R12C10R9C11R9C12R9C10R12C11R12C12R12C13R12C13R9C13R10C13R11C13R12",

    // Interact-cells: standing on any cell in `cells` shows the interact icon
    // at the `icon` cell. Press E to open that interaction's dialogue.
    // `lines` is an array of pages: { speaker, text }. A page with no speaker
    // continues the previous speaker (name plate stays visible).
    interacts: [
      // Computer desk
      {
        cells: "C9R7C10R7",
        icon: "C10R4",
        lines: [
          {
            speaker: 'narrator',
            text: "Would you like to use your computer?",
            choices: [
              { label: 'Yes', action: 'computer' },
              { label: 'No' },
            ],
          },
        ],
      },
      {
        cells: "C22R7C23R7C24R7",
        icon: "C23R3",
        lines: [
          { speaker: 'narrator', text: "Your closet is full of clothes, hanging there since the ancient ages" },
          { speaker: 'narrator', text: "You do not feel like dressing fancy today" },
        ],
      },
      {
        cells: "C6R10C6R11C6R12",
        icon: "C4R10",
        lines: [
          { speaker: 'narrator', text: "The power's out, nothing but your reflection on the TV screen" },
        ],
        // Shown on every interaction after the first one.
        repeatLines: [
          { speaker: 'narrator', text: "You can't really watch the TV with the electricity gone" },

        ],
      },
      { cells: "C13R16C14R16C15R16C16R16C17R16", icon: "C15R17", lines: [] },
      // Balcony doorway — asks before travelling
      {
        cells: "C13R15C14R15C15R15C16R15C17R15",
        icon: "C15R13",
        lines: [
          {
            speaker: 'narrator',
            text: "Visit the balcony?",
            choices: [
              { label: 'Yes', goto: 'scene-1.5' },
              { label: 'No' },
            ],
          },
        ],
      },
      // Doorway → common room
      { cells: "C17R4C18R4C19R4", icon: "C18R2", goto: 'scene-2' },
      {
        cells: "C6R5C7R6",
        icon: "C7R3",
        lines: [
          { speaker: 'narrator', text: "A plastic flower, the pot painted over by a child's hand, mostly pink." },
          { speaker: 'narrator', text: "There's a name scratched into the rim, \"JUNE & JULY\". The ampersand is backwards." },
          { speaker: 'july', sprite: 'july_idle', text: "She was 7. She said fake flowers are better because they don't die if nobody flowers them. A line she heard on the TV." },

        ],
      },
    ],
  },

};

SCENES['scene-2'] = {
  background: 'assets/commonroom.png',
  spawn: { col: 3, row: 11 },
  walkable: "C5R8C6R8C7R8C8R8C9R8C10R8C11R8C12R8C5R9C6R9C7R9C8R9C9R9C10R9C11R9C12R9C5R10C6R10C7R10C8R10C9R10C10R10C11R10C12R10C13R8C14R8C15R8C16R8C17R8C18R8C19R8C20R8C21R8C22R8C23R8C24R8C25R8C26R8C13R9C14R9C15R9C16R9C17R9C18R9C19R9C20R9C21R9C22R9C23R9C24R9C25R9C26R9C20R7C21R7C22R7C23R7C24R7C25R7C26R7C7R6C8R6C7R7C8R7C5R7C6R7C23R10C24R10C23R11C24R11C23R12C24R12C23R13C24R13C23R14C24R14C23R15C24R15C25R12C26R12C27R12C28R12C29R12C25R13C26R13C27R13C28R13C29R13C25R14C26R14C27R14C28R14C29R14C25R15C26R15C27R15C28R15C29R15C27R10C27R11C28R11C29R11C20R13C21R13C22R13C23R13C24R13C25R13C26R13C27R13C28R13C29R13C20R14C21R14C22R14C23R14C24R14C25R14C26R14C27R14C28R14C29R14C20R15C21R15C22R15C23R15C24R15C25R15C26R15C27R15C28R15C29R15C2R15C3R15C4R15C5R15C6R15C7R15C8R15C9R15C10R15C11R15C12R15C13R15C14R15C15R15C16R15C17R15C18R15C19R15C2R13C3R13C4R13C5R13C6R13C7R13C8R13C9R13C10R13C2R14C3R14C4R14C5R14C6R14C7R14C8R14C9R14C10R14C2R15C3R15C4R15C5R15C6R15C7R15C8R15C9R15C10R15C4R10C5R10C6R10C7R10C4R11C5R11C6R11C7R11C4R12C5R12C6R12C7R12C2R11C3R11C4R11C5R11C2R12C3R12C4R12C5R12C2R13C3R13C4R13C5R13C2R14C3R14C4R14C5R14C2R15C3R15C4R15C5R15C5R13C6R13C7R13C8R13C9R13C10R13C5R14C6R14C7R14C8R14C9R14C10R14C12R16C13R16C14R16C15R16C16R16C17R16C18R16",
  // Static characters/objects drawn in the scene at a given cell.
  props: [],
  interacts: [
    // Back to your room
    { cells: "C3R11C4R11", icon: "C3R9", goto: 'scene-1', at: 'C18R4' },

    // ── The knock at the door (one-shot cutscene) ──
    {
      cells: "C14R16C15R16C16R16",
      icon: "C15R18",
      script: [
        { dialog: [{ speaker: 'narrator', text: "You barely open the door and..", completeObjective: true }] },
        { playerTo: 'C13R16' },
        { actor: { id: 'june', sprite: 'june_idle', at: 'C16R17' } },
        { actorTo: { id: 'june', to: 'C16R16' } },
        {
          dialog: [
            { speaker: 'june', sprite: 'june_upset', text: "What took you so long?" },
            { speaker: 'july', sprite: 'july_idle', text: "The power is out. I couldn't hear you knocking" },
            { speaker: 'june', sprite: 'june_idle-a', text: "I know, I know." },
            { speaker: 'june', sprite: 'june_idle-a', text: "I've been sitting in the dark for two hours listening to you not wake up" },
            { speaker: 'july', sprite: 'july_angry', text: "How are YOU the one getting angry?" },
            { speaker: 'july', sprite: 'july_idle', text: "Okay so where on earth did you go at midnight?" },
            { speaker: 'narrator', text: "She's still in last night's clothes. Her hair smells like cigarettes that she didn't smoke." },
            { speaker: 'june', sprite: 'june_anxious', text: "No, no. I got here waaaayy earlier. At like 1" },
            { speaker: 'july', sprite: 'july_angry', text: "No you didn't. When exactly did you get back?" },
            { speaker: 'june', sprite: 'june_upset', text: "God, you're- Ok, fine. I came in at four." },
            { speaker: 'june', sprite: 'june_idle-b', text: "but you don't need others to hear that though. Please." },
            {
              speaker: 'narrator',
              text: "Cover for her?",
              choices: [
                {
                  label: "Yeah, you went to bed at 11",
                  flags: { covered_for_june: true },
                  lines: [
                    { speaker: 'june', sprite: 'june_smile', text: "Thanks!!" },
                    { speaker: 'narrator', text: "She says it too fast, like she's paying for something." },
                    { speaker: 'july', sprite: 'july_idle', text: "That's the 4th lie I'm holding for you this month. I'm keeping count" },
                    { speaker: 'june', sprite: 'june_upset', text: "How about you don't keep that count then" },
                  ],
                },
                {
                  label: "Absolutely. Not.",
                  flags: { covered_for_june: false },
                  lines: [
                    { speaker: 'july', sprite: 'july_idle', text: "Absolutely. Not. If you want to live like an adult, lie like an adult on your own." },
                    { speaker: 'june', sprite: 'june_upset', text: "You know how it'll be like." },
                    { speaker: 'july', sprite: 'july_idle', text: "Yeah, I do. I've always known how it's like. Far longer than you infact." },
                    { speaker: 'narrator', text: "Something in her face closes quietly. But then.." },
                    { speaker: 'june', sprite: 'june_upset', text: "Right, right. Everything is always harder for you." },
                    { speaker: 'june', sprite: 'june_upset', text: "Well then, I'm going." },
                  ],
                },
              ],
            },
          ],
        },
        // June walks off to her room while the narration plays.
        {
          parallel: [
            { dialog: [{ speaker: 'narrator', text: "And there she goes again, locked up in her room." }] },
            { actorPath: { id: 'june', path: ['C16R15', 'C27R15', 'C27R12', 'C28R12', 'C28R10'] } },
          ],
        },
        { removeActor: 'june' },
      ],
    },
  ],



};

// ── Balcony ───────────────────────────────
SCENES['scene-1.5'] = {
  background: 'assets/balcony.png',
  // Rendered at 60% of the stage-fitted size.
  fitScale: 0.6,
  spawn: { col: 15, row: 14 },
  walkable: "C7R9C8R9C9R9C10R9C11R9C12R9C13R9C14R9C15R9C16R9C17R9C18R9C19R9C20R9C21R9C22R9C23R9C24R9C7R10C8R10C9R10C10R10C11R10C12R10C13R10C14R10C15R10C16R10C17R10C18R10C19R10C20R10C21R10C22R10C23R10C24R10C7R11C8R11C9R11C10R11C11R11C12R11C13R11C14R11C15R11C16R11C17R11C18R11C19R11C20R11C21R11C22R11C23R11C24R11C7R12C8R12C9R12C10R12C11R12C12R12C13R12C14R12C15R12C16R12C17R12C18R12C19R12C20R12C21R12C22R12C23R12C24R12C7R13C8R13C9R13C10R13C11R13C12R13C13R13C14R13C15R13C16R13C17R13C18R13C19R13C20R13C21R13C22R13C23R13C24R13C4R11C5R11C6R11C4R12C5R12C6R12C4R13C5R13C6R13C25R11C26R11C27R11C25R12C26R12C27R12C25R13C26R13C27R13C9R14C10R14C11R14C12R14C13R14C14R14C15R14C16R14C17R14C18R14C19R14C20R14C21R14C22R14",
  interacts: [
    // Jump off the balcony prompt
    {
      cells: "C12R9C13R9C14R9C15R9C16R9C17R9C18R9C19R9",
      icon: "C15R7",
      lines: [
        {
          speaker: 'narrator',
          text: "Jump off the balcony?",
          choices: [
            { label: 'Yes' },
            { label: 'No' },
          ],
        },
      ],
    },
    // Step back inside
    {
      cells: "C12R14C13R14C14R14C15R14C16R14C17R14C18R14C19R14",
      icon: "C15R12",
      lines: [
        {
          speaker: 'narrator',
          text: "Return to your room?",
          choices: [
            { label: 'Yes', goto: 'scene-1', at: 'C15R15' },
            { label: 'No' },
          ],
        },
      ],
    },
  ],
};

// ── Characters ─────────────────────────────
// Each speaker gets a display name and a dialogue text colour.
const CHARACTERS = {
  narrator: { name: 'Narrator', dialogue_color: 'white', hide_name: true },
  july:     { name: 'July',     dialogue_color: '#7ab8ff' },
  june:     { name: 'June',     dialogue_color: '#ff9ec7' },
};

// Opening narration for a fresh playthrough.
const INTRO_LINES = [
  { speaker: 'narrator', text: "The ceiling fan is dead. The fridge two rooms away is dead. The whole flat is holding its breath." },
  { speaker: 'narrator', text: "The power's out. Third time this month." },
  {
    speaker: 'july', sprite: 'july_idle',
    text: "Who's knocking at the door at this hour?",
    objective: "Leave your room and open the main door. Someone is knocking",
  },
  { speaker: 'july', sprite: 'july_idle', text: "It must be June.. again. Which means she came back. Which means she went out first." },
];

window.SCENES = SCENES;
window.CHARACTERS = CHARACTERS;
window.INTRO_LINES = INTRO_LINES;
