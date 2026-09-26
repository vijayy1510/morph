// Everything Morph's free "Who's that?" AI can recognize.
// `prompt` is what the CLIP model compares the image against.
// Characters with a `file` get a full case file on the site.

const hero = (name, prompt, universe, file, kind = 'Hero') => ({ name, prompt, kind, universe, file });
const thing = (kind) => (name, prompt = `a photo of ${name.toLowerCase()}`) => ({ name, prompt, kind });

export const SUBJECTS = [
  // ---------- Marvel ----------
  hero('Spider-Man', 'Spider-Man, the Marvel superhero in a red and blue suit', 'Marvel', {
    alias: 'Peter Parker', debut: 'Amazing Fantasy #15 (1962)', creators: 'Stan Lee & Steve Ditko',
    powers: ['Wall-crawling', 'Spider-sense', 'Super strength', 'Web-shooters'],
    note: 'Got his powers from a radioactive spider bite on a school field trip.' }),
  hero('Miles Morales', 'Miles Morales Spider-Man in a black and red suit', 'Marvel', {
    alias: 'Spider-Man', debut: 'Ultimate Fallout #4 (2011)', creators: 'Brian Michael Bendis & Sara Pichelli',
    powers: ['Venom blast', 'Camouflage', 'Spider-sense', 'Wall-crawling'],
    note: 'A Brooklyn teen bitten by a genetically altered spider.' }),
  hero('Spider-Gwen', 'Spider-Gwen Ghost-Spider in a white hooded suit', 'Marvel', {
    alias: 'Gwen Stacy', debut: 'Edge of Spider-Verse #2 (2014)', creators: 'Jason Latour & Robbi Rodriguez',
    powers: ['Spider-sense', 'Wall-crawling', 'Super agility', 'Web-shooters'],
    note: 'In her universe, Gwen got bitten by the spider instead of Peter.' }),
  hero('Venom', 'Venom, the black symbiote with a huge toothy grin', 'Marvel', {
    alias: 'Eddie Brock', debut: 'The Amazing Spider-Man #300 (1988)', creators: 'David Michelinie & Todd McFarlane',
    powers: ['Shapeshifting symbiote', 'Super strength', 'Webbing', 'Undetectable by spider-sense'],
    note: 'The symbiote bonded with Spider-Man before it ever met Eddie.' }, 'Anti-hero'),
  hero('Iron Man', 'Iron Man in red and gold armor', 'Marvel', {
    alias: 'Tony Stark', debut: 'Tales of Suspense #39 (1963)', creators: 'Stan Lee, Larry Lieber, Don Heck & Jack Kirby',
    powers: ['Powered armor', 'Repulsor blasts', 'Flight', 'Genius intellect'],
    note: 'Built his first suit in a cave to escape captivity.' }),
  hero('Captain America', 'Captain America with his round star shield', 'Marvel', {
    alias: 'Steve Rogers', debut: 'Captain America Comics #1 (1941)', creators: 'Joe Simon & Jack Kirby',
    powers: ['Super-soldier serum', 'Vibranium shield', 'Peak human strength', 'Tactical genius'],
    note: 'His first cover showed him punching Hitler, months before the US joined WWII.' }),
  hero('Thor', 'Thor, the Norse god with his hammer Mjolnir', 'Marvel', {
    alias: 'Thor Odinson', debut: 'Journey into Mystery #83 (1962)', creators: 'Stan Lee, Larry Lieber & Jack Kirby',
    powers: ['Mjolnir', 'Lightning control', 'Flight', 'Godlike strength'],
    note: 'Only someone worthy can lift his hammer.' }),
  hero('Hulk', 'the Incredible Hulk, a giant green muscular monster', 'Marvel', {
    alias: 'Bruce Banner', debut: 'The Incredible Hulk #1 (1962)', creators: 'Stan Lee & Jack Kirby',
    powers: ['Limitless strength', 'Regeneration', 'Giant leaps'],
    note: 'In his very first issue the Hulk was grey, not green.' }),
  hero('Black Panther', 'Black Panther in his black vibranium suit', 'Marvel', {
    alias: "T'Challa", debut: 'Fantastic Four #52 (1966)', creators: 'Stan Lee & Jack Kirby',
    powers: ['Heart-shaped herb', 'Vibranium suit', 'Genius strategist'],
    note: 'King of Wakanda, the most advanced nation on Earth.' }),
  hero('Black Widow', 'Black Widow, the Marvel spy in a black suit', 'Marvel', {
    alias: 'Natasha Romanoff', debut: 'Tales of Suspense #52 (1964)', creators: 'Stan Lee, Don Rico & Don Heck',
    powers: ['Master spy', 'Elite martial artist', "Widow's Bite gauntlets"],
    note: 'She started out as a villain fighting Iron Man.' }),
  hero('Doctor Strange', 'Doctor Strange, the sorcerer with a red cape', 'Marvel', {
    alias: 'Stephen Strange', debut: 'Strange Tales #110 (1963)', creators: 'Stan Lee & Steve Ditko',
    powers: ['Sorcery', 'Eye of Agamotto', 'Astral projection'],
    note: 'A surgeon who turned to magic after injuring his hands.' }),
  hero('Scarlet Witch', 'Scarlet Witch with red chaos magic', 'Marvel', {
    alias: 'Wanda Maximoff', debut: 'The X-Men #4 (1964)', creators: 'Stan Lee & Jack Kirby',
    powers: ['Chaos magic', 'Reality warping', 'Hex bolts'],
    note: 'Debuted as a member of the Brotherhood of Evil Mutants.' }),
  hero('Wolverine', 'Wolverine with metal claws in a yellow suit', 'Marvel', {
    alias: 'Logan', debut: 'The Incredible Hulk #181 (1974)', creators: 'Len Wein, Roy Thomas & John Romita Sr.',
    powers: ['Healing factor', 'Adamantium claws', 'Heightened senses'],
    note: 'His first full appearance was a fight with the Hulk.' }),
  hero('Deadpool', 'Deadpool in a red and black mask with two swords', 'Marvel', {
    alias: 'Wade Wilson', debut: 'The New Mutants #98 (1991)', creators: 'Rob Liefeld & Fabian Nicieza',
    powers: ['Healing factor', 'Swords & guns', 'Breaks the fourth wall'],
    note: 'Knows he is in a comic and talks to the reader.' }, 'Anti-hero'),
  hero('Thanos', 'Thanos, the purple titan wearing the Infinity Gauntlet', 'Marvel', {
    alias: 'The Mad Titan', debut: 'The Invincible Iron Man #55 (1973)', creators: 'Jim Starlin',
    powers: ['Titan strength', 'Genius intellect', 'Infinity Gauntlet'],
    note: 'Best known for hunting down all six Infinity Stones.' }, 'Villain'),
  hero('Loki', 'Loki, the god of mischief with a horned golden helmet', 'Marvel', {
    alias: 'Loki Laufeyson', debut: 'Journey into Mystery #85 (1962)', creators: 'Stan Lee, Larry Lieber & Jack Kirby',
    powers: ['Shapeshifting', 'Illusions', 'Sorcery'],
    note: "Thor's adopted brother." }, 'Villain'),
  { name: 'Groot', prompt: 'Groot, the tree creature from Guardians of the Galaxy', kind: 'Character', universe: 'Marvel' },

  // ---------- DC ----------
  hero('Batman', 'Batman, the dark knight in a black cape and cowl', 'DC', {
    alias: 'Bruce Wayne', debut: 'Detective Comics #27 (1939)', creators: 'Bob Kane & Bill Finger',
    powers: ['Genius detective', 'Martial arts', 'Gadgets', 'Billions of dollars'],
    note: 'No superpowers at all, just training, tech and money.' }),
  hero('Superman', 'Superman with the red S shield and red cape', 'DC', {
    alias: 'Clark Kent / Kal-El', debut: 'Action Comics #1 (1938)', creators: 'Jerry Siegel & Joe Shuster',
    powers: ['Flight', 'Heat vision', 'Super strength', 'Invulnerability'],
    note: 'Originally he could only leap tall buildings. Flying came later.' }),
  hero('Wonder Woman', 'Wonder Woman with her golden lasso and tiara', 'DC', {
    alias: 'Diana Prince', debut: 'All Star Comics #8 (1941)', creators: 'William Moulton Marston & H. G. Peter',
    powers: ['Lasso of Truth', 'Indestructible bracelets', 'Super strength', 'Flight'],
    note: 'Her creator also worked on an early version of the lie detector test.' }),
  hero('The Flash', 'The Flash, the red speedster with a lightning bolt', 'DC', {
    alias: 'Barry Allen', debut: 'Showcase #4 (1956)', creators: 'Robert Kanigher & Carmine Infantino',
    powers: ['Super speed', 'Speed Force', 'Time travel'],
    note: 'His 1956 debut kicked off the Silver Age of comics.' }),
  hero('Aquaman', 'Aquaman with a golden trident', 'DC', {
    alias: 'Arthur Curry', debut: 'More Fun Comics #73 (1941)', creators: 'Paul Norris & Mort Weisinger',
    powers: ['Talks to sea life', 'Breathes underwater', 'Trident'],
    note: 'King of Atlantis.' }),
  hero('Green Lantern', 'Green Lantern with a glowing green power ring', 'DC', {
    alias: 'Hal Jordan', debut: 'Showcase #22 (1959)', creators: 'John Broome & Gil Kane',
    powers: ['Power ring', 'Hard-light constructs', 'Flight'],
    note: 'His ring runs on willpower.' }),
  hero('Joker', 'the Joker, the clown villain with green hair and a purple suit', 'DC', {
    alias: 'Unknown', debut: 'Batman #1 (1940)', creators: 'Bill Finger, Bob Kane & Jerry Robinson',
    powers: ['Chaos', 'Criminal genius', 'Joker venom'],
    note: 'He was originally meant to die in his first appearance.' }, 'Villain'),
  hero('Harley Quinn', 'Harley Quinn with pigtails and a baseball bat', 'DC', {
    alias: 'Dr. Harleen Quinzel', debut: 'Batman: The Animated Series (1992)', creators: 'Paul Dini & Bruce Timm',
    powers: ['Acrobatics', 'Giant mallet', 'Unpredictable'],
    note: 'Created for a TV cartoon before she ever appeared in a comic.' }, 'Anti-hero'),
  hero('Catwoman', 'Catwoman in a black catsuit with cat ears', 'DC', {
    alias: 'Selina Kyle', debut: 'Batman #1 (1940)', creators: 'Bill Finger & Bob Kane',
    powers: ['Master thief', 'Whip', 'Acrobatics'],
    note: 'She was first called simply "The Cat".' }, 'Anti-hero'),

  // ---------- Other famous characters ----------
  ...[
    ['Darth Vader', 'Star Wars'], ['Yoda', 'Star Wars'], ['Stormtrooper', 'Star Wars'], ['Grogu', 'Star Wars'],
    ['Pikachu', 'Pokémon'], ['Mario', 'Super Mario'], ['Sonic the Hedgehog', 'Sonic'], ['Goku', 'Dragon Ball'],
    ['Naruto', 'Naruto'], ['Luffy', 'One Piece'], ['SpongeBob', 'SpongeBob SquarePants'], ['Mickey Mouse', 'Disney'],
    ['Homer Simpson', 'The Simpsons'], ['Shrek', 'Shrek'], ['a Minion', 'Despicable Me'], ['Hello Kitty', 'Sanrio'],
    ['an Among Us crewmate', 'Among Us'], ['a Minecraft Creeper', 'Minecraft'],
  ].map(([name, universe]) => ({ name: name.replace(/^an? /, ''), prompt: `${name} from ${universe}`, kind: 'Character', universe })),

  // ---------- People (Morph never names real people) ----------
  { name: 'A person', prompt: 'a photo of a person', kind: 'Person' },
  { name: 'A selfie', prompt: 'a selfie of a person', kind: 'Person' },
  { name: 'A group of people', prompt: 'a photo of a group of friends', kind: 'Person' },
  { name: 'A baby', prompt: 'a photo of a baby', kind: 'Person' },
  { name: 'A cosplayer', prompt: 'a person cosplaying in a costume', kind: 'Person' },

  // ---------- Animals ----------
  ...['Cat', 'Kitten', 'Dog', 'Puppy', 'Parrot', 'Owl', 'Horse', 'Cow', 'Lion', 'Tiger', 'Elephant', 'Panda',
    'Fox', 'Rabbit', 'Goldfish', 'Butterfly', 'Spider', 'Snake', 'Turtle', 'Monkey', 'Bear', 'Penguin', 'Peacock',
  ].map((n) => thing('Animal')(n, `a photo of a ${n.toLowerCase()}`)),

  // ---------- Food ----------
  ...['Donut', 'Pizza', 'Burger', 'Sushi', 'Cake', 'Ice cream', 'Coffee', 'Biryani', 'Dosa', 'Samosa', 'Noodles',
    'Salad', 'Fruit', 'French fries',
  ].map((n) => thing('Food')(n, `a photo of ${n.toLowerCase()}, food`)),

  // ---------- Places ----------
  ...['Taj Mahal', 'Eiffel Tower', 'Statue of Liberty', 'Great Wall of China', 'Colosseum', 'Big Ben',
    'India Gate', 'Gateway of India',
  ].map((n) => thing('Landmark')(n, `a photo of the ${n}`)),
  ...['City at night', 'Mountains', 'Beach', 'Forest', 'Desert', 'Sunset', 'Night sky', 'Waterfall', 'Street',
    'Room interior',
  ].map((n) => thing('Scene')(n, `a photo of a ${n.toLowerCase()}`)),

  // ---------- Things ----------
  ...['Car', 'Sports car', 'Motorcycle', 'Bicycle', 'Airplane', 'Sneakers', 'Watch', 'Smartphone', 'Laptop',
    'Headphones', 'Guitar', 'Camera', 'Book', 'Flower', 'Houseplant', 'Action figure', 'Toy', 'Robot',
    'Glowing sphere', 'Cricket bat',
  ].map((n) => thing('Object')(n, `a photo of a ${n.toLowerCase()}`)),
  ...['Painting', 'Anime drawing', 'Cartoon', 'Meme', 'Screenshot', 'Logo', 'Abstract art', 'Comic book page',
  ].map((n) => thing('Art')(n, `a ${n.toLowerCase()}`)),
];
