// "Spider-Sense ?" deck, drawn when landing on a ? tile.

export type CardEffect =
  | { kind: 'collect'; amount: number }
  | { kind: 'pay'; amount: number }
  | { kind: 'collectFromEach'; amount: number }
  | { kind: 'payEach'; amount: number }
  | { kind: 'moveTo'; tile: number }
  | { kind: 'moveBy'; steps: number }
  | { kind: 'jail' }
  | { kind: 'jailCard' }
  | { kind: 'repairs'; perHouse: number; perHQ: number }
  | { kind: 'nearestUnowned' }

export interface ChanceCard {
  id: string
  title: string
  text: string
  effect: CardEffect
}

export const CHANCE_CARDS: ChanceCard[] = [
  { id: 'bugle', title: 'Front Page!', text: 'The Daily Bugle buys your photos. Collect 5,000.', effect: { kind: 'collect', amount: 5000 } },
  { id: 'jjj', title: 'Menace!', text: 'J. Jonah Jameson sues you for property damage. Pay 3,000.', effect: { kind: 'pay', amount: 3000 } },
  { id: 'start', title: 'Thwip!', text: 'Web-swing straight to START and collect your salary.', effect: { kind: 'moveTo', tile: 0 } },
  { id: 'rhino', title: 'Rhino Charge', text: 'Rhino flattens you. Go directly to The Raft. Do not pass START.', effect: { kind: 'jail' } },
  { id: 'free', title: 'Pardon from Cap', text: 'Get out of The Raft free. Keep this card until you need it.', effect: { kind: 'jailCard' } },
  { id: 'wheatcakes', title: 'Aunt May’s Wheatcakes', text: 'Everyone comes for breakfast. Collect 1,000 from every player.', effect: { kind: 'collectFromEach', amount: 1000 } },
  { id: 'teamup', title: 'Team-Up!', text: 'You hire the whole Spider-Verse for backup. Pay every player 1,000.', effect: { kind: 'payEach', amount: 1000 } },
  { id: 'stark', title: 'Stark Industries Grant', text: 'Tony funds your research. Collect 10,000.', effect: { kind: 'collect', amount: 10000 } },
  { id: 'fluid', title: 'Out of Web Fluid', text: 'Restock your web-shooters. Pay 2,000.', effect: { kind: 'pay', amount: 2000 } },
  { id: 'tingle', title: 'Spider-Sense Tingling', text: 'Danger ahead! Jump back 3 spaces.', effect: { kind: 'moveBy', steps: -3 } },
  { id: 'knull', title: 'King in Black', text: 'Knull summons you. Advance to Knull. Collect salary if you pass START.', effect: { kind: 'moveTo', tile: 11 } },
  { id: 'scout', title: 'Scouting the City', text: 'Swing to the nearest unclaimed property ahead. You may buy it.', effect: { kind: 'nearestUnowned' } },
  { id: 'repairs', title: 'Battle Damage', text: 'The city bills you for repairs: 1,500 per house, 4,000 per Web HQ.', effect: { kind: 'repairs', perHouse: 1500, perHQ: 4000 } },
  { id: 'hospital', title: 'Rough Night', text: 'Hospital bills after a villain fight. Pay 4,000.', effect: { kind: 'pay', amount: 4000 } },
  { id: 'sciencefair', title: 'Midtown Science Fair', text: 'Your invention wins first prize. Collect 3,000.', effect: { kind: 'collect', amount: 3000 } },
  { id: 'glitch', title: 'Multiverse Glitch', text: 'Reality folds. Teleport to the Multiverse Portal.', effect: { kind: 'moveTo', tile: 15 } },
]
