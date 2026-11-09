# Codex types and fields

The full catalogue of codex entry types for Epic Writer's templates, with every field.

Companion docs: `docs/product-spec.md` (CX-1 to CX-5, EP-*) and `docs/data-model.md` (`entityTypes`, `fields`, `traits`, `facts`, `links`).

---

## How to read this

**Templates.** Each type lists the starter templates that include it:

| Code | Template | Built for |
| --- | --- | --- |
| **M** | Mythological epic | Mahabharata, Ramayana, Aryavarta |
| **F** | Epic fantasy | Game of Thrones, Lord of the Rings |
| **S** | Space opera | The Expanse, Dune, Foundation |

A type left out of a template can still be added to any project; templates are only starting points.

**Field kinds** (map to `entityTypes.fields[].kind`):

| Written here | Kind | Meaning |
| --- | --- | --- |
| text | `text` | One line |
| long text | `richtext` | Paragraphs |
| number | `number` | Plain number |
| quantity (unit) | `quantity` | Number with a project unit (yojana, km, tonnes, troops) |
| date | `date` | Story time in the project calendar |
| choice [a, b] | `enum` | Pick one |
| multi [a, b] | `multiEnum` | Pick several |
| yes/no | `boolean` | |
| → Type | `entityRef` | Link to one entry of that type |
| →→ Type | `entityRefList` | Link to several entries |
| image | `image` | |
| list | `list` | Several free-text items |
| composition | `composition` | Rows of `{ label, count }` (army makeup, crew) |

**⏱** marks a field that **changes over story time**. Its changes are stored as `facts`, so a card shows the value "as of" any point. The value on the card itself is the starting value.

**Traits** give a type system behaviour (see `data-model.md`). They're listed per type.

**Kinds vs individuals.** Some things exist both as a kind and as named individuals: a *dragon* (species) and *Drogon* (one dragon), a *frigate class* and the *Rocinante*. The catalogue has separate types for these, linked by an `→ Kind` field.

---

## Common fields (every type has these)

These are built in and not repeated below.

| Field | Kind | Notes |
| --- | --- | --- |
| Name | text | Required |
| Also called | list | Aliases, epithets, titles used as names. Drive `@` mentions, autocomplete and extraction matching |
| Summary | text | One line, used on cards and as AI context |
| Description | long text | Full write-up |
| Prominence | choice [main, supporting, minor, background] | Sorting and how much AI context the entry gets |
| Canon state | choice [canon, tentative, scrapped] | Scrapped is ignored by checks and the AI |
| Exists | date span | When it begins and ends in story time (built, born, founded, destroyed) |
| First appears | per work | Where each work first shows it |
| Images | image list | Portraits, concept art, references |
| Tags | list | Free tagging |
| Notes | long text | Private writer's notes, never shown to the AI as canon |
| Sources | text | Chapter or page in a source work (adaptations), or real-world reference |
| Connections | links | All typed links to other entries (see the link types at the end) |

---

## Group: Land

### 1. Realm / Plane of existence
Templates **M F** · Traits `geo`
Cosmological layers and other worlds: Svarga, Patala, Naraka, Brahmaloka; Valinor, the Halls of Mandos, the Shadow World; the Weirwood net.

| Field | Kind | Notes |
| --- | --- | --- |
| Realm kind | choice [heaven, underworld, spirit world, dream world, afterlife, divine abode, mortal world, void, other] | |
| Position in cosmos | text | Above, below, beside, outside the mortal world |
| Ruled by | →→ Deity / Character | |
| Inhabitants | →→ Race / Species | |
| Who can enter | long text | Conditions, rites, deaths |
| How to reach it | long text | Portals, death, rituals, ascension |
| Time flow | text | e.g. "one day here is a year on earth" |
| Physical rules | long text | What works differently there |
| Reachable from | →→ Gate / Portal | |
| Status ⏱ | choice [open, sealed, lost, destroyed] | |

### 2. World / Planet
Templates **F S** · Traits `geo`
Arrakis, Caladan, Earth, Mars, Ilus; Arda, Planetos.

| Field | Kind | Notes |
| --- | --- | --- |
| Star system | → Star system | |
| Planet class | choice [terrestrial, desert, ocean, ice, gas giant, jungle, volcanic, barren, terraformed, artificial, other] | |
| Moons | →→ Celestial body | |
| Diameter | quantity (km) | |
| Gravity | quantity (g) | |
| Day length | quantity (hours) | |
| Year length | quantity (days) | |
| Atmosphere | text | Breathable, thin, toxic, none |
| Climate | long text | |
| Water | text | Scarce, abundant, frozen |
| Population ⏱ | number | |
| Native species | →→ Race / Species, Creature species | |
| Key resources | →→ Resource | |
| Governed by ⏱ | → Kingdom / Nation, Government, Dynasty | Fief holder, colonial power |
| Capital / main city | → City | |
| Terraforming status ⏱ | text | |
| Strategic value | long text | |
| Status ⏱ | choice [inhabited, colonised, abandoned, quarantined, destroyed] | |

### 3. Star system
Templates **S** · Traits `geo`
Sol, the Alpha Centauri system, Canopus.

| Field | Kind | Notes |
| --- | --- | --- |
| Star type | text | G-type, red dwarf, binary |
| Stars | →→ Celestial body | |
| Planets | →→ World / Planet | |
| Stations and habitats | →→ Station / Habitat | |
| Gates | →→ Gate / Portal | Ring gates, jump points |
| Distance from origin | quantity (light-years) | |
| Controlled by ⏱ | → Government, Faction | |
| Status ⏱ | choice [settled, frontier, unexplored, contested, lost] | |

### 4. Celestial body
Templates **M F S** · Traits `geo`
Stars, moons, comets, asteroids, nebulae. Includes omen-bearing ones: Dhruva (the pole star), the red comet in Westeros, Ceres, Eros, Phoebe.

| Field | Kind | Notes |
| --- | --- | --- |
| Body kind | choice [star, moon, comet, asteroid, dwarf planet, nebula, constellation, black hole, other] | |
| Orbits | → World / Planet, Celestial body | |
| Size | quantity (km) | |
| Visible from | →→ World / Planet, Realm | |
| Cycle | text | Return period of a comet, phases of a moon |
| Mythic meaning | long text | Omens, gods it's tied to |
| Inhabited | yes/no | |
| Resources | →→ Resource | Ice, metals |
| Status ⏱ | choice [stable, mined, colonised, destroyed, moved] | Eros was moved |

### 5. Station / Habitat
Templates **S** · Traits `geo`, `locatable`
Tycho Station, Ceres Station, Medina Station, Anderson Station, orbital habitats, generation ships used as settlements.

| Field | Kind | Notes |
| --- | --- | --- |
| Station kind | choice [orbital, asteroid base, spin habitat, shipyard, research, military, refinery, generation ship, ring, other] | |
| Location ⏱ | → World / Planet, Celestial body, Star system | |
| Population ⏱ | number | |
| Gravity | text | Spin, thrust, none |
| Operated by ⏱ | → Guild / Corporation, Government, Faction | |
| Docking capacity | number | |
| Defences | long text | |
| Life support | text | |
| Notable sections | list | Rings, drums, docks |
| Status ⏱ | choice [operational, damaged, abandoned, destroyed, captured] | |

### 6. Continent
Templates **M F** · Traits `geo`
Westeros, Essos, Middle-earth, Jambudvipa.

| Field | Kind | Notes |
| --- | --- | --- |
| World | → World / Planet | |
| Regions | →→ Region | |
| Kingdoms | →→ Kingdom / Nation | |
| Area | quantity | |
| Climate | long text | |
| Bordering seas | →→ Sea / Ocean / Lake | |
| Major ranges | →→ Mountain / Range | |
| Peoples | →→ Culture | |

### 7. Region / Province
Templates **M F S** · Traits `geo`, `locatable`
The North, the Reach, the Shire, Gondor's fiefs, Kurukshetra region, the Belt.

| Field | Kind | Notes |
| --- | --- | --- |
| Region kind | choice [province, fief, district, territory, march, wilderness, zone, other] | |
| Part of ⏱ | → Kingdom / Nation, Continent, Region | Regions can change hands |
| Governed by ⏱ | → Dynasty, Character, Government | Liege lord, governor |
| Seat | → Palace / Castle / Seat, City | |
| Settlements | →→ City, Village / Settlement | |
| Terrain | multi [plains, hills, mountains, forest, desert, marsh, coast, river valley, tundra, jungle, space] | |
| Climate | text | |
| Population ⏱ | number | |
| Resources | →→ Resource | |
| Peoples | →→ Culture | |
| Notable features | list | |

### 8. Kingdom / Nation / Territory
Templates **M F S** · Traits `geo`, `locatable`
Kuru, Panchala, Matsya; the Seven Kingdoms, Gondor, Rohan, Mordor; the UN, MCRN, the Imperium.

| Field | Kind | Notes |
| --- | --- | --- |
| Polity kind | choice [kingdom, empire, republic, federation, confederacy, city-state, tribal lands, theocracy, colony, corporate state, other] | |
| Capital ⏱ | → City | |
| Throne / highest office | → Position / Title | Holder over time lives on the position |
| Ruling dynasty ⏱ | → Dynasty / Noble house | |
| Government | → Government / Council | |
| Overlord ⏱ | → Kingdom / Nation | Vassal of |
| Status ⏱ | choice [independent, vassal, occupied, at war, in civil war, fallen, dissolved] | |
| Territory | →→ Region, Continent, World / Planet | |
| Borders | →→ Kingdom / Nation | |
| Area | quantity | |
| Population ⏱ | number | |
| Demonym | text | Kuru-born, Gondorian, Martian |
| Peoples | →→ Culture | |
| Languages | →→ Language | |
| Religions | →→ Religion / Faith | |
| Currency | → Currency | |
| Economy | long text | |
| Key resources | →→ Resource | |
| Laws | →→ Law / Code | |
| Armed forces ⏱ | →→ Force / Army / Fleet | |
| Strength rating ⏱ | number | Total troops or akshauhinis |
| Allies ⏱ / Enemies ⏱ | links | via `allied with`, `at war with` |
| Banner / sigil | → Symbol / Sigil | |
| Motto | text | "Winter is coming" |
| Founded | date | |
| Founding myth | long text | |

### 9. City
Templates **M F S** · Traits `geo`, `locatable`
Hastinapur, Indraprastha, Dwaraka; King's Landing, Minas Tirith; Arrakeen, Baltimore.

| Field | Kind | Notes |
| --- | --- | --- |
| City kind | choice [capital, port, fortress city, holy city, trade city, mining town, ruin, other] | |
| Part of ⏱ | → Region, Kingdom / Nation, World / Planet | |
| Ruled by ⏱ | → Character, Dynasty, Government | |
| Population ⏱ | number | |
| Founded by | → Character, Dynasty | |
| Districts / quarters | list | |
| Landmarks | →→ Building / Landmark, Palace / Castle, Sacred site | |
| Defences | →→ Fort / Stronghold | Walls, gates |
| Water source | → River, Sea / Ocean / Lake | |
| Economy / known for | long text | |
| Climate | text | |
| Peoples | →→ Culture | |
| Status ⏱ | choice [thriving, declining, besieged, sacked, abandoned, rebuilt, destroyed] | |

### 10. Village / Settlement
Templates **M F S** · Traits `geo`, `locatable`
Fisher villages on the Yamuna, Hobbiton, Bree, a Fremen sietch, a Belt mining outpost.

| Field | Kind | Notes |
| --- | --- | --- |
| Settlement kind | choice [village, hamlet, camp, sietch, outpost, colony, nomad camp, other] | |
| Part of ⏱ | → Region, City, World / Planet | |
| Headed by ⏱ | → Character | Chief, naib, elder |
| Population ⏱ | number | |
| Livelihood | text | Fishing, farming, mining |
| Peoples | →→ Culture, Clan / Tribe | |
| Dwellings | →→ Dwelling | |
| Status ⏱ | choice [inhabited, abandoned, destroyed, moved] | |

### 11. Dwelling / Home
Templates **M F S** · Traits `geo`, `locatable`
Huts, ashram hermitages, Bag End, a family hold, crew quarters. (Your "Huts" category.)

| Field | Kind | Notes |
| --- | --- | --- |
| Dwelling kind | choice [hut, hermitage / ashram, house, hall, cave home, tent, smial, quarters, other] | |
| Location | → Village / Settlement, City, Forest, Region | |
| Owner / dweller ⏱ | →→ Character | |
| Built from | text | Thatch, stone, mud, prefab |
| Description of rooms | long text | |
| Significance | long text | |
| Status ⏱ | choice [lived in, empty, destroyed] | |

### 12. Palace / Castle / Seat
Templates **M F S** · Traits `geo`, `locatable`
The Hastinapur palace, Maya Sabha; Winterfell, the Red Keep, Meduseld; the Arrakeen Residency.

| Field | Kind | Notes |
| --- | --- | --- |
| Seat kind | choice [palace, castle, keep, hall, manor, residency, court, other] | |
| Location | → City, Region | |
| Seat of ⏱ | → Dynasty, Kingdom / Nation, Position | |
| Lord / occupant ⏱ | → Character | |
| Built by / architect | →→ Character | Maya built the Maya Sabha |
| Built | date | |
| Notable halls and features | list | Throne room, illusion floors, godswood |
| Secret passages | long text | |
| Defences | long text | |
| Garrison ⏱ | number | |
| Status ⏱ | choice [occupied, abandoned, captured, burned, ruined, rebuilt] | |

### 13. Building / Landmark
Templates **M F S** · Traits `geo`, `locatable`
Libraries, inns, markets, prisons, monuments, bridges, lighthouses, statues, arenas, docks, labs. (Prisons, crossings and markets live here as building kinds.)

| Field | Kind | Notes |
| --- | --- | --- |
| Building kind | choice [library, inn / tavern, market, prison / dungeon, arena, monument / statue, bridge / crossing, lighthouse, tomb, workshop, laboratory, dock, gate, other] | |
| Location | → City, Region, Station | |
| Owner / keeper ⏱ | → Character, Guild / Corporation, Government | |
| Built | date | |
| Purpose | long text | |
| Notable features | list | |
| Status ⏱ | choice [in use, abandoned, destroyed, rebuilt] | |

### 14. Sacred site / Temple
Templates **M F S** · Traits `geo`, `locatable`
Kurukshetra as dharmakshetra, temples, ghats, godswoods, the Great Sept of Baelor, Sietch Tabr's holy places.

| Field | Kind | Notes |
| --- | --- | --- |
| Site kind | choice [temple, shrine, sacred grove, ghat, tirtha, sept, monastery, tomb, holy mountain, other] | |
| Location | → City, Region, River, Mountain | |
| Faith | → Religion / Faith | |
| Deity | →→ Deity | |
| Keepers ⏱ | →→ Character, Order / Society | |
| Rites held here | →→ Ritual / Ceremony | |
| Pilgrimage season | text | |
| Powers or blessings | long text | |
| Status ⏱ | choice [active, desecrated, destroyed, forgotten, rebuilt] | |

### 15. River
Templates **M F S** · Traits `geo`
Ganga, Yamuna, Saraswati; the Trident, Anduin, Brandywine.

| Field | Kind | Notes |
| --- | --- | --- |
| Source | → Mountain / Range, Sea / Ocean / Lake, Region | |
| Mouth | → Sea / Ocean / Lake, River | |
| Length | quantity | |
| Flows through | →→ Region, Kingdom / Nation | |
| Tributaries | →→ River | |
| Cities on its banks | →→ City | |
| Fords and crossings | →→ Building / Landmark, Checkpoint / Chokepoint | |
| Navigable | yes/no | |
| Seasonal behaviour | text | Floods, dry season |
| Divine or mythic nature | long text | Ganga is a goddess |
| Personified as | → Deity, Character | |

### 16. Sea / Ocean / Lake
Templates **M F S** · Traits `geo`
The Narrow Sea, Belegaer, the Ocean of Milk, polar seas of Arrakis (lost), Europa's ocean.

| Field | Kind | Notes |
| --- | --- | --- |
| Water kind | choice [ocean, sea, lake, bay, strait, lagoon, cosmic ocean, other] | |
| Borders | →→ Continent, Region, Kingdom / Nation | |
| Islands | →→ Island / Archipelago | |
| Ports | →→ Port / Harbour | |
| Currents and weather | long text | |
| Creatures | →→ Creature species | |
| Controlled by ⏱ | → Kingdom / Nation, Faction | Naval control |
| Mythic meaning | long text | Samudra manthan |

### 17. Mountain / Range / Pass
Templates **M F S** · Traits `geo`
Himavat, Meru, Kailash; the Misty Mountains, the Eyrie's peak, the Shield Wall of Arrakis.

| Field | Kind | Notes |
| --- | --- | --- |
| Landform kind | choice [peak, range, pass, volcano, plateau, ridge, other] | |
| Range | → Mountain / Range | For a single peak |
| Height | quantity | |
| Region | →→ Region, Kingdom / Nation | |
| Passes | →→ Mountain / Range, Checkpoint / Chokepoint | |
| Climate and dangers | long text | |
| Inhabitants | →→ Race / Species, Creature species, Clan / Tribe | |
| Sacred or mythic | long text | |
| Resources | →→ Resource | Mithril in Moria |

### 18. Forest / Jungle
Templates **M F S** · Traits `geo`
Khandava, Naimisha, Dandaka; Mirkwood, Fangorn, the Wolfswood.

| Field | Kind | Notes |
| --- | --- | --- |
| Forest kind | choice [forest, jungle, sacred grove, swamp forest, enchanted wood, other] | |
| Region | →→ Region, Kingdom / Nation | |
| Area | quantity | |
| Dominant flora | →→ Plant / Flora | |
| Creatures | →→ Creature species | |
| Inhabitants | →→ Race / Species, Clan / Tribe, Character | Sages, nagas, Ents |
| Dangers | long text | |
| Paths through | →→ Route / Road | |
| Status ⏱ | choice [wild, settled, burned, cleared, regrown, cursed] | Khandava was burned |

### 19. Desert / Wasteland
Templates **M F S** · Traits `geo`
Thar, the Red Waste, the Dagorlad, the Deep Desert, the Tanzerouft.

| Field | Kind | Notes |
| --- | --- | --- |
| Desert kind | choice [sand, rock, salt flat, ash waste, ice waste, other] | |
| Region | →→ Region, World / Planet | |
| Area | quantity | |
| Climate | text | |
| Water sources | list | Oases, wells, windtraps |
| Creatures | →→ Creature species | |
| Peoples | →→ Culture, Clan / Tribe | |
| Hazards | long text | Storms, worms, heat |
| Survival requirements | long text | Stillsuits, water rules |

### 20. Island / Archipelago
Templates **M F S** · Traits `geo`
Lanka, the Iron Islands, Dragonstone, Tol Eressëa, Númenor.

| Field | Kind | Notes |
| --- | --- | --- |
| Sea | → Sea / Ocean / Lake | |
| Islands in group | →→ Island / Archipelago | |
| Ruled by ⏱ | → Dynasty, Kingdom / Nation | |
| Settlements | →→ City, Village / Settlement | |
| Area | quantity | |
| Climate | text | |
| Status ⏱ | choice [inhabited, abandoned, sunk, destroyed] | Númenor sank |

### 21. Cave / Underground
Templates **M F S** · Traits `geo`
Moria, the caves of the Children, sietch caves, underworld entrances, mines, tunnels.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [cave, cavern system, mine, tunnel network, dwarf hall, underworld entrance, other] | |
| Location | → Mountain / Range, Region | |
| Depth | quantity | |
| Inhabitants | →→ Race / Species, Creature species | |
| Entrances | list | |
| Resources | →→ Resource | |
| Dangers | long text | |
| Status ⏱ | choice [inhabited, abandoned, sealed, collapsed] | |

### 22. Landform
Templates **M F S** · Traits `geo`
Everything not covered above: plains, valleys, marshes, glaciers, canyons, cliffs, hills, steppe, tundra, coasts.

| Field | Kind | Notes |
| --- | --- | --- |
| Landform kind | choice [plain, valley, marsh / swamp, glacier, canyon, cliff, hill, steppe, tundra, coast, delta, crater, other] | |
| Region | →→ Region | |
| Area | quantity | |
| Notable features | long text | |
| Strategic value | long text | Feeds battlefields and war planning |

### 23. Biome / Climate zone
Templates **M F S**
Monsoon belts, the Lands of Always Winter, Arrakis's deep desert belt, Mars's domes.

| Field | Kind | Notes |
| --- | --- | --- |
| Climate | text | Temperate, arid, monsoon, polar |
| Seasons | long text | Including irregular ones (Westerosi winters) |
| Temperature range | text | |
| Rainfall | text | |
| Covers | →→ Region, Continent, World / Planet | |
| Flora | →→ Plant / Flora | |
| Fauna | →→ Creature species | |
| Effects on people | long text | |

### 24. Route / Road / Trade route
Templates **M F S** · Traits `geo`
Royal roads, pilgrim paths, the Kingsroad, the Old Forest Road, shipping lanes, spice routes, transfer orbits.

| Field | Kind | Notes |
| --- | --- | --- |
| Route kind | choice [road, path, river route, sea lane, trade route, pilgrimage route, space lane, other] | |
| From / to | → Place, → Place | Any location type |
| Passes through | →→ Region, City, Checkpoint / Chokepoint | |
| Length | quantity | |
| Typical travel time | text | Per transport (or let the app compute it) |
| Transports allowed | →→ Transport method | |
| Goods carried | →→ Resource | |
| Controlled by ⏱ | → Kingdom / Nation, Faction | |
| Dangers | long text | Bandits, storms, pirates |
| Toll | text | |
| Status ⏱ | choice [open, closed, dangerous, blockaded, abandoned] | |

### 25. Port / Harbour / Spaceport
Templates **M F S** · Traits `geo`, `locatable`
Dwaraka harbour, Lys, the Grey Havens, Arrakeen spaceport, Tycho docks.

| Field | Kind | Notes |
| --- | --- | --- |
| Port kind | choice [sea port, river port, haven, spaceport, dock ring, other] | |
| Location | → City, Station, Region | |
| Controlled by ⏱ | → Kingdom / Nation, Guild / Corporation | |
| Capacity | number | Ships at once |
| Routes served | →→ Route / Road | |
| Status ⏱ | choice [open, blockaded, destroyed] | |

### 26. Gate / Portal
Templates **M F S** · Traits `geo`
The ring gates, the Black Gate (as a passage), Valinor's Straight Road, doors to Patala, the Door of Durin, weirwood visions.

| Field | Kind | Notes |
| --- | --- | --- |
| Gate kind | choice [ring gate, magical portal, physical gate, hidden door, dimensional rift, other] | |
| Connects | →→ Place | Any location types, including Realms |
| Built by | → Character, Race / Species, Unknown | |
| How it opens | long text | Passwords, rituals, speed limits |
| Who can pass | long text | |
| Limits and dangers | long text | Slow zone, mass limits |
| Guarded by ⏱ | → Force, Character, Creature | |
| Status ⏱ | choice [open, closed, sealed, destroyed, unknown] | |

### 27. Natural phenomenon
Templates **M F S** · Traits `event`
Coriolis storms, eclipses, long winters, monsoon floods, solar flares, the slow zone, a celestial omen.

| Field | Kind | Notes |
| --- | --- | --- |
| Phenomenon kind | choice [storm, eclipse, flood, drought, earthquake, eruption, season, cosmic event, plague of nature, other] | |
| Where | →→ Place | |
| When / how often | text | Once, seasonal, cyclical |
| Duration | text | |
| Effects | long text | |
| Believed cause | long text | In-world explanation |
| Seen as omen of | → Prophecy / Omen | |

### 28. Plant / Flora
Templates **M F S**
Soma, tulsi, weirwood, athelas, the White Tree, kingsfoil; Arrakis's plants; hydroponic crops.

| Field | Kind | Notes |
| --- | --- | --- |
| Plant kind | choice [tree, herb, flower, crop, fungus, vine, grass, sacred plant, alien flora, other] | |
| Grows in | →→ Biome, Region, Forest | |
| Appearance | long text | |
| Uses | multi [food, medicine, poison, ritual, building, dye, magic, trade] | |
| Effects when used | long text | |
| Rarity | choice [common, uncommon, rare, unique, extinct] | |
| Sacred to | →→ Deity, Religion / Faith | |
| As resource | → Resource | |
| Status ⏱ | choice [thriving, endangered, extinct, last of its kind] | |

### 29. Creature species
Templates **M F S**
Horses, elephants, wolves, direwolves, dragons, sandworms, mûmakil, eagles, shadowcats.

| Field | Kind | Notes |
| --- | --- | --- |
| Nature | choice [natural, magical, divine, engineered, alien, undead] | |
| Habitat | →→ Biome, Region, Forest, Desert | |
| Size | quantity | |
| Lifespan | quantity (years) | |
| Diet | text | |
| Intelligence | choice [animal, clever, near-sentient, sentient] | Sentient peoples go in Race / Species |
| Temperament | text | |
| Abilities | →→ Ability / Power | Flight, fire, telepathy |
| Weaknesses | long text | |
| Uses to people | multi [mount, war beast, labour, food, companion, sacred, resource source] | |
| Domesticated by | →→ Culture | |
| Population ⏱ | text | Common, few, last ones |
| Status ⏱ | choice [common, rare, endangered, extinct, returned] | Dragons |

### 30. Mythical creature
Templates **M F S** · Parent type **Creature species**
Rakshasa-kind beasts, nagas as serpents, Garuda's kind, dragons of legend, the Kraken, Balrogs, Shai-Hulud as worshipped, the protomolecule's creations. Inherits every Creature species field, plus:

| Field | Kind | Notes |
| --- | --- | --- |
| Origin myth | long text | |
| Powers | →→ Ability / Power | |
| Weaknesses and banes | long text | What kills or binds it |
| How it is summoned or found | long text | |
| Believed real by | →→ Culture | Myth to some, fact to others |
| Associated deity | → Deity | |

### 31. Named creature
Templates **M F S** · Traits `born`, `locatable`, `holdable`
One individual animal or beast: Drogon, Ghost, Shadowfax, Airavata, Uchchaihshravas, Shai-Hulud worms if named.

| Field | Kind | Notes |
| --- | --- | --- |
| Species | → Creature species, Mythical creature | |
| Born / hatched | date | Computed age |
| Died | date | |
| Bonded to / owner ⏱ | → Character | `holdable` tracks this over time |
| Role | choice [mount, companion, war beast, guardian, pet, wild, sacred] | |
| Appearance | long text | |
| Size ⏱ | quantity | Dragons grow |
| Abilities | →→ Ability / Power | |
| Location ⏱ | → Place | |
| Status ⏱ | choice [alive, wounded, dead, missing, wild, captured] | |

---

## Group: Civilisation

### 32. Character
Templates **M F S** · Traits `born`, `locatable`, `ranked`
Every person, mortal or not.

**Identity**

| Field | Kind | Notes |
| --- | --- | --- |
| Full name | text | Formal name with house or patronymic |
| Titles and epithets | list | "Pitamah", "the Kingslayer", "Muad'Dib". Held offices live on Position |
| Gender | text | |
| Species / race | → Race / Species | |
| Culture | →→ Culture | |
| Born | date | Computed age at any point |
| Died | date | |
| Birthplace | → Place | |
| Place of death | → Place | |
| Cause of death | text | |
| Family | → Dynasty / Noble house, Family / Clan | |
| Parents, spouses, children, siblings | links | `kinship` links; drives family trees |
| Status ⏱ | choice [alive, dead, missing, captured, exiled, in hiding, transformed, ascended, undead, unknown] | |
| Location ⏱ | → Place | |
| Allegiance ⏱ | →→ Kingdom / Nation, Faction, Dynasty | |
| Occupation ⏱ | →→ Profession | |
| Social class ⏱ | → Social class | |
| Warrior rank ⏱ | → Warrior class / Rank | |
| Religion ⏱ | → Religion / Faith | |
| Languages | →→ Language | |
| Literacy | →→ Script / Writing system | |

**Physical**

| Field | Kind | Notes |
| --- | --- | --- |
| Apparent age | text | When it differs from computed age |
| Height | quantity | |
| Build | text | |
| Complexion | text | |
| Hair | text | |
| Eyes | text | Blue-in-blue for spice addicts |
| Distinguishing marks | list | Scars, birthmarks, kavacha-kundala |
| Typical attire | →→ Attire / Clothing | |
| Physical condition ⏱ | text | Wounded, blinded, maimed, healthy |
| Disabilities or afflictions ⏱ | →→ Disease / Affliction | |
| Voice and bearing | text | |

**Personality**

| Field | Kind | Notes |
| --- | --- | --- |
| Temperament | text | |
| Traits | list | |
| Virtues | list | |
| Flaws and vices | list | |
| Strengths | list | |
| Weaknesses | list | |
| Fears | list | |
| Values and beliefs | long text | |
| Moral code | text | Dharma they follow, alignment |
| Likes | list | |
| Dislikes | list | |
| Habits and mannerisms | list | |
| Hobbies | list | |

**Screenwriting core**

| Field | Kind | Notes |
| --- | --- | --- |
| Story role | choice [protagonist, deuteragonist, antagonist, villain, mentor, ally, foil, love interest, trickster, guardian, herald, comic relief, supporting, minor] | |
| Archetype | text | Hero, sage, tragic hero, warrior, ruler, outcast |
| Want (external goal) | long text | |
| Need (internal) | long text | |
| Motivation | long text | Why they want it |
| Wound / ghost | long text | |
| The lie they believe | long text | |
| The truth they learn | long text | |
| Internal conflict | long text | |
| External conflict | long text | |
| Stakes | long text | What they lose if they fail |
| Arc type | choice [positive change, negative change, flat, corruption, disillusionment, redemption, fall] | |
| Arc summary | long text | Beginning, midpoint, end |
| Turning points | list | Key moments with episode references |
| Backstory | long text | |
| Secrets | →→ Secret | |
| Fate | long text | Planned ending, even if not written yet |

**Voice** (used by the AI to flag off-voice dialogue)

| Field | Kind | Notes |
| --- | --- | --- |
| How they speak | long text | Formal, terse, poetic, crude |
| Vocabulary and register | text | |
| Catchphrases | list | |
| Verbal tics | list | |
| Voice samples | list | Signature lines |
| Never says | list | Words or tones out of character |

**Abilities and possessions**

| Field | Kind | Notes |
| --- | --- | --- |
| Skills | list | |
| Abilities and powers | →→ Ability / Power | |
| Known astras / techniques ⏱ | →→ Astra, Ability / Power | Learned over time |
| Teachers | →→ Character | Also as `teaching` links |
| Weapons held ⏱ | →→ Weapon, Astra | Holdings live on the weapon (`holdable`) |
| Possessions ⏱ | →→ Artifact, Vehicle, Named creature | |
| Boons and curses ⏱ | →→ Boon / Curse | |
| Vows sworn ⏱ | →→ Vow / Oath | |
| Wealth ⏱ | text | |

**Production**

| Field | Kind | Notes |
| --- | --- | --- |
| Casting notes | long text | Actor references, look |
| Costume notes | long text | |

### 33. Deity / Divine being
Templates **M F S** · Traits `locatable`
Indra, Surya, Ganga, Shiva; the Seven, the Old Gods, R'hllor, the Drowned God; the Valar and Maiar; God-Emperor (as worshipped). Also spirits, demons, ancestors and cosmic forces.

| Field | Kind | Notes |
| --- | --- | --- |
| Being kind | choice [god, goddess, demigod, celestial, spirit, demon, ancestor, nature spirit, cosmic force, other] | |
| Domain | list | Thunder, rivers, death, war, harvest |
| Pantheon / religion | →→ Religion / Faith | |
| Abode | → Realm / Plane, Sacred site | |
| Consort / family | links | `kinship` |
| Mount (vahana) | → Named creature | Airavata for Indra |
| Weapons and symbols | →→ Weapon, Astra, Symbol / Sigil | Vajra |
| Powers | →→ Ability / Power | |
| Avatars and incarnations | →→ Character | |
| Appearance | long text | Iconography |
| Worshipped by | →→ Culture, Kingdom / Nation | |
| Offerings and rites | →→ Ritual / Ceremony | |
| Mantras / prayers | list | |
| Boons granted | →→ Boon / Curse | |
| Real or believed | choice [real in this world, believed only, ambiguous] | |
| Intervenes in story | yes/no | |
| Status ⏱ | choice [worshipped, forgotten, dead, sleeping, banished, returned] | |

### 34. Race / Species
Templates **M F S** · Traits `born`
Sentient peoples: humans, devas, asuras, rakshasas, nagas, gandharvas, apsaras, vanaras; Elves, Dwarves, Hobbits, Ents, Orcs, Children of the Forest, White Walkers; Belters (as an adapted human strain), the protomolecule builders, Face Dancers.

| Field | Kind | Notes |
| --- | --- | --- |
| Nature | choice [mortal, immortal, divine, semi-divine, demonic, undead, engineered, alien, other] | |
| Origin | long text | Created by, descended from |
| Homeland | →→ Place | |
| Lifespan | quantity (years) | |
| Average height | quantity | |
| Physical traits | long text | |
| Innate abilities | →→ Ability / Power | Shape-shifting, flight, low-g adaptation |
| Weaknesses | long text | |
| Mental and social traits | long text | |
| Cultures | →→ Culture | |
| Languages | →→ Language | |
| Can interbreed with | →→ Race / Species | |
| Relations with others | long text | |
| Population ⏱ | text | |
| Status ⏱ | choice [thriving, declining, hidden, endangered, extinct, departed] | Elves sailing west |

### 35. Culture / People
Templates **M F S**
Kurus, Yadavas, Nishadas, fisherfolk of the Yamuna; Northmen, Dothraki, Rohirrim; Fremen, Belters, Martians.

| Field | Kind | Notes |
| --- | --- | --- |
| Species | →→ Race / Species | |
| Homeland ⏱ | →→ Place | |
| Population ⏱ | number | |
| Languages | →→ Language | |
| Religion | →→ Religion / Faith | |
| Social structure | long text | |
| Social classes | →→ Social class | |
| Governance | long text | |
| Values | long text | |
| Customs and taboos | →→ Custom / Tradition | |
| Laws | →→ Law / Code | |
| Rites of passage | →→ Ritual / Ceremony | |
| Festivals | →→ Festival | |
| Cuisine | →→ Food / Drink | |
| Attire | →→ Attire / Clothing | |
| Arts | →→ Art / Song / Story | |
| Naming conventions | long text | Patronymics, clan names, epithets; used by AI name generation |
| Greetings and etiquette | long text | |
| Gender roles | long text | |
| Marriage customs | long text | Swayamvara, polyandry, bride price |
| Death customs | long text | Cremation, sky burial, water reclaimed |
| Warfare style | long text | |
| Livelihood | text | |
| Relations with other cultures | long text | |
| Symbols | →→ Symbol / Sigil | |

### 36. Language
Templates **M F S**
Sanskrit, Prakrit dialects; High Valyrian, the Old Tongue, Sindarin, Quenya, Black Speech; Belter creole, Chakobsa, Galach.

| Field | Kind | Notes |
| --- | --- | --- |
| Language family | → Language | Parent language |
| Spoken by | →→ Culture, Race / Species | |
| Regions | →→ Place | |
| Script | →→ Script / Writing system | |
| Status ⏱ | choice [living, liturgical, dying, dead, secret] | |
| Register | multi [common, court, sacred, battle, trade, secret] | |
| Sound and feel | long text | For writing dialogue |
| Grammar notes | long text | |
| Naming patterns | long text | |
| Common words and phrases | list | Linked to glossary terms |
| Glossary | →→ Term / Glossary entry | |

### 37. Script / Writing system
Templates **M F S**
Brahmi; Tengwar, Cirth; Belter glyphs; secret battle languages.

| Field | Kind | Notes |
| --- | --- | --- |
| Script kind | choice [alphabet, syllabary, logographic, runic, pictographic, other] | |
| Used for | →→ Language | |
| Direction | text | |
| Medium | text | Palm leaf, stone, parchment, terminal |
| Who can read it | long text | Literacy |
| Example image | image | |

### 38. Dynasty / Noble house
Templates **M F S** · Traits `institution`
Kuru, Panchala, Yadava, Ikshvaku; Stark, Lannister, Targaryen, the House of Elendil; Atreides, Harkonnen, Corrino.

| Field | Kind | Notes |
| --- | --- | --- |
| Founder | → Character | |
| Founded | date | |
| Seat ⏱ | → Palace / Castle / Seat | |
| Lands ⏱ | →→ Region, Kingdom / Nation, World / Planet | |
| Head of house ⏱ | → Character | |
| Heir ⏱ | → Character | Computed from succession, can be overridden |
| Members | links | `member of` and `kinship`; drives the family tree |
| Cadet branches | →→ Dynasty / Noble house | |
| Liege ⏱ | → Dynasty / Noble house, Kingdom / Nation | |
| Vassals ⏱ | →→ Dynasty / Noble house | |
| Sigil | → Symbol / Sigil | |
| Words / motto | text | |
| Colours | text | |
| Ancestral weapons | →→ Weapon, Artifact | Ice, Narsil |
| Succession rule | choice [primogeniture, agnatic, elective, by merit, by combat, by divine sign, other] | |
| Wealth ⏱ | text | |
| Military strength ⏱ | number | |
| Allies ⏱ / Rivals ⏱ | links | |
| Feuds and kanly | long text | |
| History | long text | Its events appear automatically from Historical event links |
| Curses on the house | →→ Boon / Curse | |
| Status ⏱ | choice [ruling, great house, minor house, fallen, extinct, in exile] | |

### 39. Family / Clan / Tribe
Templates **M F S** · Traits `institution`
Non-royal kin groups: fisher clans, Nishada tribes; Dothraki khalasars, hill tribes; Fremen sietch tribes, Belter families and crews.

| Field | Kind | Notes |
| --- | --- | --- |
| Group kind | choice [family, clan, tribe, khalasar, sietch tribe, crew family, other] | |
| Leader ⏱ | → Character | Chief, khal, naib |
| Members | links | `member of`, `kinship` |
| Home ⏱ | → Village / Settlement, Region | |
| Culture | → Culture | |
| Size ⏱ | number | |
| Livelihood | text | |
| Customs | →→ Custom / Tradition | |
| Allies ⏱ / Rivals ⏱ | links | |
| Symbol | → Symbol / Sigil | |
| Status ⏱ | choice [thriving, scattered, absorbed, destroyed] | |

### 40. Faction / Alliance
Templates **M F S** · Traits `institution`
The Pandava alliance, the Kaurava alliance; the Fellowship, the Iron Throne's loyalists, the Faith Militant; the OPA, the Free Navy, the Fremen rebellion.

| Field | Kind | Notes |
| --- | --- | --- |
| Faction kind | choice [political, military, rebel, religious, criminal, ideological, coalition, other] | |
| Leader ⏱ | → Character | |
| Members ⏱ | →→ Character, Dynasty, Kingdom / Nation, Clan / Tribe | |
| Goals | long text | |
| Ideology | long text | |
| Formed | date | |
| Base ⏱ | → Place | |
| Forces ⏱ | →→ Force / Army / Fleet | |
| Resources | long text | |
| Allies ⏱ / Enemies ⏱ | links | |
| Symbol | → Symbol / Sigil | |
| Status ⏱ | choice [rising, dominant, declining, underground, victorious, disbanded, destroyed] | |

### 41. Order / Society
Templates **M F S** · Traits `institution`
Knightly, religious, monastic and secret orders: rishi lineages, warrior brotherhoods; the Night's Watch, the Kingsguard, the Faceless Men, the Maesters' Citadel order, the Istari; the Bene Gesserit, the Mentats, the Swordmasters of Ginaz, the Fish Men Speakers.

| Field | Kind | Notes |
| --- | --- | --- |
| Order kind | choice [knightly, religious, monastic, secret, scholarly, assassin, mystic, other] | |
| Leader ⏱ | → Character | Lord Commander, Reverend Mother |
| Members | links | `member of` |
| Headquarters | → Place | |
| Purpose | long text | |
| Initiation | long text | Trials, the gom jabbar |
| Vows | →→ Vow / Oath | |
| Ranks inside the order | list | |
| Training and disciplines | →→ Discipline / Field of knowledge | |
| Secret knowledge | →→ Secret | |
| Powers | →→ Ability / Power | The Voice |
| Rules and codes | long text | |
| Symbol | → Symbol / Sigil | |
| Public reputation | long text | |
| Hidden agenda | long text | Breeding programmes |
| Status ⏱ | choice [active, secret, diminished, disbanded, destroyed] | |

### 42. Guild / Corporation / Company
Templates **M F S** · Traits `institution`
Merchant guilds; the Iron Bank, the Golden Company, the Alchemists' Guild; the Spacing Guild, CHOAM, Protogen, Mao-Kwikowski.

| Field | Kind | Notes |
| --- | --- | --- |
| Organisation kind | choice [merchant guild, craft guild, bank, mercenary company, trading company, corporation, cartel, other] | |
| Head ⏱ | → Character | |
| Headquarters | → Place | |
| Industry | text | |
| Monopolies | →→ Resource, Route / Road, Technology | Guild's spacefolding monopoly |
| Assets ⏱ | long text | |
| Wealth ⏱ | text | |
| Members / employees ⏱ | number | |
| Forces ⏱ | →→ Force / Army / Fleet | Private armies |
| Clients and debtors ⏱ | links | |
| Politics and influence | long text | |
| Symbol | → Symbol / Sigil | |
| Status ⏱ | choice [active, dominant, bankrupt, dissolved, nationalised] | |

### 43. Government / Council / Institution
Templates **M F S** · Traits `institution`
The Kuru sabha, the council of elders; the Small Council, the White Council, the Citadel as institution; the Landsraad, the UN General Assembly, the MCRN admiralty.

| Field | Kind | Notes |
| --- | --- | --- |
| Government kind | choice [monarchy, council, assembly, theocracy, republic, oligarchy, military junta, corporate board, tribal council, other] | |
| Of | → Kingdom / Nation, Faction, Guild / Corporation | |
| Seat | → Place | |
| Head ⏱ | → Character | |
| Seats / offices | →→ Position / Title | Master of Coin, Hand |
| Members ⏱ | links | |
| Powers | long text | |
| How decisions are made | long text | |
| How members are chosen | long text | |
| Laws issued | →→ Law / Code | |
| Status ⏱ | choice [functioning, deadlocked, suspended, dissolved, overthrown] | |

### 44. Position / Title / Office
Templates **M F S** · Traits `position`
One office held by one entity at a time: the Throne of Hastinapur, senapati, Hand of the King, King under the Mountain, Steward of Gondor, Padishah Emperor, Secretary-General.

| Field | Kind | Notes |
| --- | --- | --- |
| Office kind | choice [throne, military command, council seat, religious office, governorship, honorific, other] | |
| Of | → Kingdom / Nation, Government, Order, Dynasty | |
| Holder ⏱ | → Character | `position` trait tracks holders over time |
| Seat | → Place | |
| Powers and duties | long text | |
| How it is gained | choice [inheritance, appointment, election, conquest, combat, divine choice, purchase] | |
| Succession rule | long text | Feeds the computed line of succession |
| Heir ⏱ | → Character | |
| Rival claimants ⏱ | →→ Character | |
| Regalia | →→ Artifact | Crown, ring, seal |
| Form of address | text | "Your Grace", "Maharaj" |
| Status ⏱ | choice [held, vacant, contested, abolished] | |

### 45. Social class / Caste / Estate
Templates **M F S** · Traits `ranked`
Varna and jati as the story world defines them; smallfolk, nobility, maesters; the Imperium's faufreluches, Belters vs. Inners.

| Field | Kind | Notes |
| --- | --- | --- |
| Rank in society | number | Lower number = higher status |
| Defined by | choice [birth, wealth, occupation, religion, merit, species, location] | |
| Traditional occupations | →→ Profession | |
| Rights | long text | |
| Duties | long text | |
| Restrictions | long text | |
| Mobility | long text | Can one move between classes? |
| Markers | long text | Dress, speech, names |
| Within culture | → Culture | |

### 46. Profession / Occupation
Templates **M F S**
Charioteer (suta), ferryman, priest, smith, bard; maester, sellsword, knight; Mentat, Swordmaster, pilot, rock-hopper, ice miner.

| Field | Kind | Notes |
| --- | --- | --- |
| Field of work | text | |
| Social class | → Social class | |
| Guild or order | → Guild / Corporation, Order / Society | |
| Training | →→ Discipline / Field of knowledge | |
| Tools | →→ Device / Tool, Weapon | |
| Status in society | text | |
| Pay | text | |

### 47. Religion / Faith
Templates **M F S**
Vedic dharma, Shaiva and Vaishnava traditions; the Faith of the Seven, the Old Gods, R'hllor, the Many-Faced God; Zensunni, the Orange Catholic Bible faith, the Church of Muad'Dib.

| Field | Kind | Notes |
| --- | --- | --- |
| Deities | →→ Deity | |
| Founder / prophet | →→ Character | |
| Founded | date | |
| Core beliefs | long text | |
| Cosmology | long text | |
| Afterlife | → Realm / Plane | |
| Scriptures | →→ Text / Book / Scripture | |
| Clergy and orders | →→ Order / Society | |
| Head of faith ⏱ | → Character, Position | High Septon |
| Rituals | →→ Ritual / Ceremony | |
| Festivals | →→ Festival | |
| Holy sites | →→ Sacred site | |
| Symbols | →→ Symbol / Sigil | |
| Moral code | long text | |
| Taboos | →→ Custom / Tradition | |
| Followers | →→ Culture, Kingdom / Nation | |
| Sects and schisms | →→ Religion / Faith | |
| Status ⏱ | choice [dominant, minority, persecuted, underground, dying, extinct] | |

### 48. Ritual / Ceremony
Templates **M F S** · Traits `event`
Yajna, Rajasuya, Ashvamedha, swayamvara, upanayana, shraddha; weddings, coronations, trial by combat, the burning of Mirri Maz Duur; the water of life rite, Fremen funerals, the spice orgy.

| Field | Kind | Notes |
| --- | --- | --- |
| Ritual kind | choice [sacrifice, wedding, coronation, funeral, initiation, purification, oath-taking, contest, worship, seasonal, other] | |
| Faith or culture | → Religion / Faith, Culture | |
| Purpose | long text | |
| Performed by | →→ Profession, Order / Society, Character | |
| Participants | long text | |
| Where | →→ Place | |
| When | text | Season, life stage, occasion |
| Steps | list | |
| Items needed | →→ Artifact, Resource | |
| Words spoken | long text | Mantras, vows |
| Effects | long text | Real or believed |
| Taboos and failures | long text | What happens if done wrong |
| Notable performances | →→ Historical event | |

### 49. Festival / Holiday
Templates **M F S** · Traits `event`
Seasonal and religious festivals, name days, harvest feasts, founding days.

| Field | Kind | Notes |
| --- | --- | --- |
| Faith or culture | → Religion / Faith, Culture | |
| Date in calendar | text | Day and month in the project calendar |
| Recurs | choice [yearly, cyclical, once per age, irregular] | |
| Commemorates | → Historical event, Deity | |
| Customs | long text | |
| Foods | →→ Food / Drink | |
| Where it's celebrated | →→ Place | |

### 50. Law / Code
Templates **M F S** · Traits `ruleSystem`
Rules of dharma, laws of war, guest right, the King's Peace, the Great Convention, kanly, Belter ship law.

| Field | Kind | Notes |
| --- | --- | --- |
| Law kind | choice [criminal, civil, religious, martial, customary, interstellar, other] | |
| Issued by | → Government, Position, Religion / Faith, Character | |
| Applies in | →→ Kingdom / Nation, Region, Culture | |
| Applies to | text | Everyone, nobles, warriors, guests |
| Rule text | long text | |
| Crimes it defines | list | |
| Punishments | list | Fine, exile, death, mutilation, airlock |
| Enforced by | →→ Order / Society, Force, Position | |
| Courts / judges | → Government, Position | |
| Exceptions | long text | |
| Enacted | date | |
| Status ⏱ | choice [in force, ignored, repealed, broken] | Continuity checks use this |
| Famous breaches | →→ Historical event | The Red Wedding |

### 51. Custom / Tradition / Taboo
Templates **M F S**
Unwritten rules: not attacking an unarmed warrior, not refusing a challenge to dice, water sharing, bread and salt.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [custom, tradition, taboo, etiquette, superstition] | |
| Held by | →→ Culture, Religion / Faith, Order | |
| Rule | long text | |
| Origin | long text | |
| Consequence of breaking it | long text | |
| Exceptions | long text | |

### 52. School / Gurukul / Academy
Templates **M F S** · Traits `institution`
Gurukuls of Drona, Parashurama's ashram, Sandipani's school; the Citadel, Rivendell as a seat of learning; Bene Gesserit schools, Mentat schools, Ginaz, Martian naval academy.

| Field | Kind | Notes |
| --- | --- | --- |
| School kind | choice [gurukul, ashram, academy, university, monastery, military school, apprenticeship, other] | |
| Location ⏱ | → Place | |
| Head teacher ⏱ | → Character | |
| Teachers ⏱ | →→ Character | `teaching` links |
| Students ⏱ | →→ Character | `student of` links; drives the teaching lineage view |
| Disciplines taught | →→ Discipline / Field of knowledge | |
| Astras / powers taught | →→ Astra, Ability / Power | |
| Admission | long text | Who may enter, and who is refused (Karna, Ekalavya) |
| Fees / guru dakshina | long text | |
| Duration | text | |
| Graduation test | long text | |
| Reputation | text | |
| Status ⏱ | choice [active, closed, destroyed, moved] | |

### 53. Discipline / Field of knowledge
Templates **M F S**
Dhanurveda (archery), Ayurveda, astrology, statecraft (arthashastra); maester chains of knowledge, Water Dancing, lore of the Ents; Mentat computation, prana-bindu training, the Weirding Way, astrogation.

| Field | Kind | Notes |
| --- | --- | --- |
| Discipline kind | choice [martial, scholarly, medical, mystical, technical, artistic, political, other] | |
| Taught at | →→ School / Gurukul / Academy | |
| Masters ⏱ | →→ Character | |
| Texts | →→ Text / Book / Scripture | |
| Levels or ranks | list | |
| Abilities it grants | →→ Ability / Power | |
| Prerequisites | long text | |
| Secret or open | choice [open, restricted, secret] | |

### 54. Text / Book / Scripture
Templates **M F S**
The Vedas, Upanishads, the Dharmashastras; The Seven-Pointed Star, the Red Book of Westmarch, The Lineages and Histories; the Orange Catholic Bible, the Azhar Book, ship's logs.

| Field | Kind | Notes |
| --- | --- | --- |
| Text kind | choice [scripture, history, chronicle, poem, law code, manual, letter, map, prophecy, log, other] | |
| Author | →→ Character | |
| Written | date | |
| Language | → Language | |
| Script | → Script / Writing system | |
| Content summary | long text | |
| Key passages | list | |
| Copies and where they are ⏱ | →→ Place, Character | |
| Who may read it | long text | |
| Reliability | choice [accurate, biased, propaganda, forged, partly true, unknown] | |
| As an account | → Account / Source | When the text is an in-world historical source |
| Status ⏱ | choice [known, lost, hidden, destroyed, rediscovered] | |

### 55. Art / Song / Story
Templates **M F S**
In-world songs, poems, plays, epics, paintings, sculptures: "The Rains of Castamere", "The Lay of Lúthien", ballads, Belter songs, temple carvings.

| Field | Kind | Notes |
| --- | --- | --- |
| Art kind | choice [song, poem, epic, play, painting, sculpture, carving, dance, tapestry, other] | |
| Creator | →→ Character, Culture | |
| Created | date | |
| Subject | →→ any | People and events it depicts |
| Lyrics / text excerpt | long text | Original writing only |
| Meaning in-world | long text | |
| Used in story as | text | Signal, omen, propaganda |
| Where it is ⏱ | → Place | For physical works |

### 56. Game / Sport / Contest
Templates **M F S**
The dice game (dyuta), archery contests, swayamvara tests; tourneys, jousts, cyvasse; sandworm riding, zero-g sports, kanly duels.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [board game, gambling, sport, tournament, duel form, trial, other] | |
| Played by | →→ Culture, Social class | |
| Rules | long text | |
| Equipment | →→ Device / Tool, Weapon | |
| Stakes | long text | |
| Cheating methods | long text | Shakuni's dice |
| Famous matches | →→ Historical event | |

### 57. Myth / Legend
Templates **M F S**
Stories told inside the world: the churning of the ocean, the Long Night, the Last Hero, Beren and Lúthien, the Butlerian Jihad as legend.

| Field | Kind | Notes |
| --- | --- | --- |
| Told by | →→ Culture, Religion / Faith | |
| Characters in it | →→ Character, Deity | |
| Story | long text | |
| Lesson or meaning | long text | |
| Truth in this world | choice [true, partly true, false, distorted, unknown] | Writers know; characters may not |
| Actual events behind it | →→ Historical event | |
| Variants | long text | Different tellings by different cultures |
| Linked prophecies | →→ Prophecy / Omen | |

### 58. Historical event
Templates **M F S** · Traits `event`
Ganga's departure, the Terrible Vow, the dice game, the burning of the lac house; Robert's Rebellion, the Red Wedding, the Fall of Gondolin; the Butlerian Jihad, the Eros incident, the Ring's opening.

| Field | Kind | Notes |
| --- | --- | --- |
| Event kind | choice [birth, death, marriage, coronation, war, battle, treaty, founding, fall, disaster, discovery, betrayal, ritual, migration, revelation, other] | |
| When | date | Story time |
| Duration | text | |
| Where | →→ Place | |
| Participants | →→ Character, Faction, Kingdom / Nation, Dynasty | |
| Causes | links | `caused by` (causal); used by impact analysis |
| Consequences | links | `caused`; facts can cite this as their cause |
| Facts it changed | auto | Status, holders, strength changes that point here |
| Part of | → Historical event, War / Conflict, Era / Age | |
| Witnesses | →→ Character | Feeds knowledge tracking |
| Who knows the truth ⏱ | links | `knows` links |
| Accounts | →→ Account / Source | Conflicting versions |
| Shown on screen | narrative refs | Where each work reveals it |
| Remembered as | long text | How later generations tell it |

### 59. Era / Age
Templates **M F S** · Traits `event`
Satya, Treta, Dwapara and Kali Yuga; the Age of Heroes, the Targaryen era, the Third Age; the Butlerian Jihad era, the Imperium, the Transport Union era.

| Field | Kind | Notes |
| --- | --- | --- |
| Starts | date | Can drive calendar eras |
| Ends | date | |
| Defined by | long text | |
| Dominant powers | →→ Kingdom / Nation, Dynasty, Faction | |
| Key events | →→ Historical event | |
| Technology level | text | |
| Moral or cosmic state | long text | Dharma declining across yugas |
| Began with / ended with | → Historical event | |

### 60. Prophecy / Omen
Templates **M F S** · Traits `setup`, `secret`
Prophecies about Bhishma's death, Karna's fate, the birth of Kali Yuga; the Prince That Was Promised, Maggy the Frog's prophecy, Glorfindel's prophecy on the Witch-king; the Kwisatz Haderach, the Lisan al-Gaib.

| Field | Kind | Notes |
| --- | --- | --- |
| Prophecy kind | choice [prophecy, omen, vision, curse-foretold, dream, oracle] | |
| Spoken by | → Character, Deity, Text | |
| When spoken | date | |
| Exact words | long text | |
| Interpretations | list | Each believed by different people |
| About | →→ Character, Kingdom / Nation, Era | |
| True meaning | long text | Writer's truth |
| Planted (narrative) | narrative refs | Where the audience first hears it |
| Hinted | narrative refs | |
| Fulfilled ⏱ | choice [pending, fulfilled, failed, subverted, self-fulfilling] | Feeds unpaid-setup checks |
| Fulfilled by | → Historical event | |
| Engineered by | → Order / Society, Character | Bene Gesserit Missionaria Protectiva |
| Known to ⏱ | links | `knows` |

### 61. Food / Drink
Templates **M F S**
Kheer, soma, palm wine; lemon cakes, lembas, Dornish red; spice coffee, Belter fungus, recycled water.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [dish, bread, sweet, drink, alcohol, ritual offering, ration, delicacy, other] | |
| Culture | →→ Culture | |
| Ingredients | →→ Resource, Plant / Flora | |
| Preparation | long text | |
| Eaten when | text | Daily, feast, ritual, travel |
| Effects | long text | Lembas sustains; spice addicts |
| Taboo for | →→ Culture, Social class | |

### 62. Attire / Clothing
Templates **M F S**
Dhoti, angavastram, armour-silks; Lannister crimson, Night's Watch black, elven cloaks; stillsuits, vac suits, Bene Gesserit robes. Jewellery and ornaments included.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [everyday, court, ceremonial, mourning, armour-wear, uniform, protective suit, jewellery, headgear, footwear, other] | |
| Worn by | →→ Culture, Social class, Order / Society, Profession | |
| Materials | →→ Resource | |
| Colours and patterns | text | |
| Signifies | long text | Rank, faith, mourning |
| Function | long text | Stillsuit water recovery |
| Image | image | |

### 63. Currency
Templates **M F S**
Gold coins (suvarna, nishka), cowries; gold dragons, stags, pennies; solaris, Belter scrip.

| Field | Kind | Notes |
| --- | --- | --- |
| Issued by | → Kingdom / Nation, Guild / Corporation, Government | |
| Denominations | list | With relative values |
| Material | → Resource | |
| Exchange rates ⏱ | long text | Against other currencies |
| Used in | →→ Place | |
| Value ⏱ | text | Inflation, debasement |
| Appearance | long text | |

### 64. Resource / Commodity / Material
Templates **M F S** · Traits `resource`
Gold, iron, horses, grain, soma, salt; Valyrian steel, dragonglass, mithril, wildfire; melange (spice), water, ice, protomolecule samples, reaction mass.

| Field | Kind | Notes |
| --- | --- | --- |
| Resource kind | choice [metal, mineral, crop, livestock, fuel, drug, magical material, water, manufactured good, data, other] | |
| Found at / produced at | →→ Place | |
| Produced by | →→ Kingdom / Nation, Guild / Corporation, Clan / Tribe | |
| Controlled by ⏱ | →→ Faction, Kingdom / Nation, Guild / Corporation | Feeds the economy view |
| Output ⏱ | quantity | Per year |
| Price ⏱ | text | |
| Uses | list | |
| Properties | long text | Valyrian steel kills White Walkers |
| How it is made or extracted | long text | |
| Rarity | choice [common, scarce, rare, unique, lost knowledge] | |
| Trade routes | →→ Route / Road | |
| Dangers | long text | Addiction, toxicity |

### 65. Disease / Affliction
Templates **M F S**
Curses of illness, leprosy-like curses, Pandu's curse as an affliction; greyscale, the shaking sickness, the Black Breath; spice addiction, radiation sickness, the protomolecule infection.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [disease, plague, poisoning, wound, madness, addiction, curse-affliction, mutation, other] | |
| Cause | long text | |
| Spread | text | Contagious, inherited, by touch |
| Symptoms and stages | list | |
| Duration | text | |
| Treatment / cure | →→ Medicine / Remedy | |
| Fatality | choice [mild, serious, often fatal, always fatal, transforms] | |
| Afflicted ⏱ | →→ Character | |
| Outbreaks | →→ Historical event | |

### 66. Medicine / Remedy / Poison / Drug
Templates **M F S**
Sanjeevani herb, Ayurvedic remedies, poisons (Bhima's poisoned kheer); milk of the poppy, the Strangler, athelas; the Water of Life, sapho juice, semuta, anti-radiation drugs.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [medicine, herb remedy, poison, antidote, drug, stimulant, sedative, elixir, other] | |
| Made from | →→ Plant / Flora, Resource | |
| Prepared by | →→ Profession | |
| Effects | long text | |
| Dose | text | |
| Side effects | long text | |
| Antidote | → Medicine / Remedy / Poison / Drug | |
| Treats | →→ Disease / Affliction | |
| Legality | text | |
| Rarity | choice [common, rare, secret, unique] | |

### 67. Symbol / Sigil / Emblem
Templates **M F S**
Arjuna's Hanuman banner (Kapidhvaja), the Kuru elephant; the direwolf, the lion, the White Tree; the Atreides hawk, the OPA split circle. (Your Symbols & Iconography.)

| Field | Kind | Notes |
| --- | --- | --- |
| Symbol kind | choice [sigil, banner, crest, holy symbol, mark, brand, logo, glyph, other] | |
| Belongs to | →→ Dynasty, Kingdom / Nation, Faction, Religion / Faith, Order, Character | |
| Description | long text | Charges, colours, layout |
| Meaning | long text | |
| Image | image | |
| Used on | list | Banners, armour, coins, ships |

### 68. Term / Glossary entry
Templates **M F S** · Traits `term`
In-world words: dharma, kshatriya, akshauhini; khaleesi, warg, mellon; kanly, gom jabbar, beltalowda.

| Field | Kind | Notes |
| --- | --- | --- |
| Language | → Language | |
| Pronunciation | text | |
| Literal meaning | text | |
| Usage | long text | |
| Example sentence | text | |
| Spelling variants | list | Feeds spelling-variant detection |
| Related entry | → any | When the term names a codex entry |

---

## Group: War

### 69. War / Conflict
Templates **M F S** · Traits `event`
The Kurukshetra war; Robert's Rebellion, the War of the Five Kings, the War of the Ring; the Butlerian Jihad, the Arrakis war, the Free Navy war.

| Field | Kind | Notes |
| --- | --- | --- |
| Conflict kind | choice [war, civil war, rebellion, invasion, crusade / jihad, feud, cold war, skirmish campaign, other] | |
| Starts / ends | date span | |
| Sides | →→ Faction / Alliance | Usually two or more alliances |
| Commanders ⏱ | →→ Character | Supreme commander per side, changes by day |
| Forces | →→ Force / Army / Fleet | |
| Initial strength per side | composition | e.g. 11 vs 7 akshauhinis |
| Causes | links | `caused by` |
| Battles | →→ Battle / Siege | |
| Theatre | →→ Place | |
| Rules of engagement | → Law / Code | The Kurukshetra rules |
| Rule breaches | →→ Historical event | |
| Casualties ⏱ | number | |
| Outcome | long text | |
| Victor | → Faction / Alliance | |
| Treaty ending it | → Treaty / Alliance | |
| Consequences | links | `caused` |

### 70. Battle / Siege
Templates **M F S** · Traits `event`
Each day of Kurukshetra, the Chakravyuha day; the Battle of the Blackwater, the Bastards, Helm's Deep, the Pelennor Fields; the Battle of Arrakeen, the Battle over Ganymede, the Battle of Medina.

| Field | Kind | Notes |
| --- | --- | --- |
| Battle kind | choice [field battle, siege, naval, space, ambush, duel, skirmish, raid, last stand, other] | |
| Part of | → War / Conflict | |
| When | date | Day of the war |
| Duration | text | |
| Battlefield | → Battlefield, Place | |
| Sides | →→ Faction / Alliance | |
| Commanders | →→ Character | |
| Forces engaged | →→ Force / Army / Fleet | |
| Strength before | composition | Rohan 500 vs. 10,000 Uruk-hai |
| Strength after | composition | Written as facts on each force |
| Formations used | →→ Battle formation / Tactic | |
| Weapons and astras used | →→ Weapon, Astra | Each use can consume charges |
| Key moments | list | |
| Notable deaths | →→ Character | Writes status facts |
| Weather and terrain | long text | |
| Outcome | choice [victory, defeat, stalemate, retreat, pyrrhic victory] | |
| Victor | → Faction / Alliance | |
| Casualties | composition | |
| Turning point | long text | |
| Consequences | links | `caused` |

### 71. Force / Army / Fleet
Templates **M F S** · Traits `hasStrength`, `locatable`
An akshauhini, the Pandava host; the Northern army, the Unsullied, the Rohirrim éored, the Army of the Dead; Harkonnen legions, Sardaukar, the MCRN fleet, a Free Navy squadron.

| Field | Kind | Notes |
| --- | --- | --- |
| Force kind | choice [army, host, legion, fleet, squadron, warband, garrison, mercenary company, militia, undead host, other] | |
| Belongs to ⏱ | → Faction, Kingdom / Nation, Dynasty, Guild / Corporation | |
| Commander ⏱ | → Character | Checks flag a dead commander leading |
| Second in command ⏱ | → Character | |
| Unit type | → Unit type | e.g. 1 akshauhini |
| Composition ⏱ | composition | Chariots, elephants, cavalry, infantry, ships, dragons |
| Total strength ⏱ | number | Checks flag strength rising without reinforcements |
| Position ⏱ | → Place | |
| Morale ⏱ | choice [high, steady, wavering, broken] | |
| Supplies ⏱ | text | |
| Equipment | →→ Weapon, Armour, Siege engine, Vehicle | |
| Notable warriors | →→ Character | |
| Formations known | →→ Battle formation / Tactic | |
| Banner | → Symbol / Sigil | |
| Raised | date | |
| Status ⏱ | choice [mustering, marching, engaged, besieging, routed, destroyed, disbanded, reinforced] | |

### 72. Unit type
Templates **M F S**
How a force is counted: akshauhini (21,870 chariots, 21,870 elephants, 65,610 horse, 109,350 foot), patti, chamu; éored, legion, cohort; squadron, battle group.

| Field | Kind | Notes |
| --- | --- | --- |
| Standard composition | composition | |
| Total strength | number | Computed from composition |
| Made up of | →→ Unit type | Patti → senamukha → gulma … → akshauhini |
| Commanded by rank | → Position / Title, Warrior class | |
| Used by | →→ Culture, Kingdom / Nation | |

### 73. Battle formation / Tactic
Templates **M F S**
Vyuhas: Chakravyuha, Krauncha, Garuda, Makara; shield wall, wedge, pincer; fleet screens, torpedo saturation, kanly duel forms.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [formation, maneuver, strategy, stratagem, doctrine, duel form] | |
| Shape / layout | long text | |
| Image | image | Diagram |
| Purpose | long text | |
| Strengths | long text | |
| Weaknesses | long text | |
| How to break it | long text | Knowing how to enter but not leave the Chakravyuha |
| Who knows it ⏱ | →→ Character | `knows` links, learned over time |
| Units required | composition | |
| Used in | →→ Battle / Siege | |

### 74. Warrior class / Rank
Templates **M F S** · Traits `ranked`
Atiratha, Maharatha, Atimaharatha, Rathi, Ardharathi; knight, squire, sworn sword; Swordmaster, Sardaukar levar, MCRN ranks.

| Field | Kind | Notes |
| --- | --- | --- |
| Rank order | number | 1 = highest |
| Can face | text | e.g. "60,000 warriors at once" |
| Strength rating | number | Used by the war board |
| Requirements | long text | |
| How it's granted | choice [by assessment, by title, by deed, by order, by birth] | |
| Within | → Culture, Order / Society, Force | |
| Holders ⏱ | auto | Characters whose rank fact points here |

### 75. Weapon
Templates **M F S** · Traits `holdable`
Named or notable weapons: Gandiva, Vijaya bow, the Sudarshana disc, Bhima's mace; Ice, Longclaw, Needle, Narsil / Andúril, Sting; crysknives, the Rocinante's railgun, Martian Goliath armour weapons.

| Field | Kind | Notes |
| --- | --- | --- |
| Weapon kind | choice [bow, sword, spear, mace, axe, disc, dagger, shield-weapon, firearm, ship weapon, energy weapon, other] | |
| Made by | → Character, Race / Species | |
| Made | date | |
| Material | →→ Resource | |
| Holder ⏱ | → Character | `holdable` tracks who has it when |
| Location ⏱ | → Place | When not held |
| Properties | long text | Never misses, hums near orcs |
| Limits | long text | |
| Lineage | long text | Past wielders |
| Reforged / renamed | → Weapon | Narsil → Andúril |
| Kills | links | |
| Status ⏱ | choice [whole, broken, lost, destroyed, reforged, hidden] | |

### 76. Astra / Divine weapon
Templates **M F** · Parent type **Weapon** · Traits `holdable`, `ability`
Brahmastra, Brahmashirsha, Pashupatastra, Vasavi Shakti, Narayanastra, Vajra; elsewhere, weapons of divine origin or a single use. Inherits every Weapon field, plus:

| Field | Kind | Notes |
| --- | --- | --- |
| Presiding deity | → Deity | |
| Invocation | long text | Mantra, rite, conditions |
| Rule system | → Rule system | |
| Charges ⏱ | number | Vasavi Shakti: 1. Checks flag use after it's spent |
| Recharge | text | |
| Counter | →→ Astra, Ability / Power | |
| Known by ⏱ | →→ Character | `knows` links; learned from teachers |
| Taught by | →→ Character | |
| Conditions of use | long text | Cannot be used on lesser warriors |
| Cost of use | long text | |
| Effect | long text | |
| Withdrawal | long text | Can it be recalled? Ashwatthama couldn't |
| Uses | →→ Historical event, Battle / Siege | |

### 77. Armour / Shield / Protection
Templates **M F S** · Traits `holdable`
Karna's kavacha (natural armour), divine armour; Valyrian steel armour, mithril shirt; personal shields (Holtzman), Goliath power armour, vac suits.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [body armour, shield, helm, natural armour, energy shield, power armour, enchanted protection, other] | |
| Holder ⏱ | → Character | |
| Material | →→ Resource | |
| Protects against | long text | |
| Weakness | long text | Shields and lasguns |
| Made by | → Character, Race / Species | |
| Status ⏱ | choice [worn, given away, broken, lost, destroyed] | Karna gives his away |

### 78. Siege engine / War machine
Templates **M F S**
Catapults, battering rams, siege towers; scorpions, mûmakil howdahs, Grond; ornithopters as gunships, torpedo platforms, harvester-crushers.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [catapult, ram, tower, ballista, bombard, war vehicle, artillery platform, other] | |
| Crew | number | |
| Range | quantity | |
| Effect | long text | |
| Used by | →→ Force / Army / Fleet | |
| Count ⏱ | number | |

### 79. Fort / Stronghold
Templates **M F S** · Traits `geo`, `locatable`
Hill forts, walled cities' citadels; the Wall, Castle Black, Helm's Deep, Barad-dûr, Minas Tirith; Arrakeen shield wall defences, MCRN bases, Tycho as a fortress.

| Field | Kind | Notes |
| --- | --- | --- |
| Fort kind | choice [fortress, castle, citadel, wall, keep, bunker, orbital fortress, other] | |
| Location | → Place | |
| Guards | →→ Place, Route / Road | What it protects |
| Holder ⏱ | → Faction, Dynasty, Kingdom / Nation, Character | |
| Commander ⏱ | → Character | |
| Garrison ⏱ | number | |
| Defences | list | Walls, moats, gates, shields |
| Weak points | long text | The culvert at Helm's Deep |
| Supplies ⏱ | text | How long it can hold out |
| Secret ways | long text | |
| Status ⏱ | choice [held, besieged, breached, fallen, abandoned, destroyed] | |

### 80. Watchtower / Outpost
Templates **M F S** · Traits `geo`, `locatable`
Signal towers, border posts; Amon Sûl, the beacons of Gondor, Wall castles; listening posts, sensor stations.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [watchtower, beacon, signal post, border post, sensor station, other] | |
| Location | → Place | |
| Sees | →→ Place, Route / Road | Line of sight |
| Signals to | →→ Watchtower / Outpost, Fort | Beacon chains; feeds communication-speed checks |
| Signal method | text | Fire, ravens, drums, tightbeam |
| Holder ⏱ | → Faction, Kingdom / Nation | |
| Garrison ⏱ | number | |
| Status ⏱ | choice [manned, abandoned, captured, destroyed] | |

### 81. Checkpoint / Chokepoint
Templates **M F S** · Traits `geo`, `locatable`
River fords, mountain passes, city gates; the Twins' crossing, the Bloody Gate, the Gap of Rohan, the Hot Gates-type defiles; the ring space, a blockade point.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [pass, ford, bridge, gate, strait, toll point, orbital lane, other] | |
| Location | → Place | |
| Controls access between | →→ Place | |
| Width / capacity | text | How many can pass at once |
| Holder ⏱ | → Faction, Kingdom / Nation, Dynasty | |
| Defences | list | |
| Toll / price of passage | text | The Freys' price |
| Strategic value | long text | |
| Status ⏱ | choice [open, held, blockaded, closed, destroyed] | |

### 82. Battlefield
Templates **M F S** · Traits `geo`
Kurukshetra; the Trident, the Pelennor Fields, the Field of Fire; the Arrakeen basin, the space above Ganymede.

| Field | Kind | Notes |
| --- | --- | --- |
| Location | → Region, Landform, Place | |
| Terrain | long text | |
| Size | quantity | |
| Features | list | Rivers, hills, ditches, cover |
| Advantages | long text | Who it favours |
| Battles fought here | →→ Battle / Siege | |
| Sacred or cursed | long text | Dharmakshetra |
| Aftermath | long text | Burial grounds, haunted |

### 83. Treaty / Alliance / Truce
Templates **M F S** · Traits `event`
The Pandavas' exile terms, Krishna's peace mission; the Pact of the First Men and the Children, the marriage pact with the Freys; the Great Convention, MCRN-UN accords, the Fremen-Atreides alliance.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [peace treaty, alliance, truce, marriage pact, trade agreement, surrender, oath of fealty, other] | |
| Parties | →→ Faction, Kingdom / Nation, Dynasty, Character | |
| Signed | date | |
| Terms | list | |
| Guaranteed by | →→ Character, Deity, Order | |
| Duration | text | |
| Sealed with | text | Marriage, hostage, oath |
| Status ⏱ | choice [proposed, in force, broken, expired, fulfilled] | |
| Broken by | → Historical event | |

---

## Group: Rule systems
Magic, technology and powers, handled the same way.

### 84. Rule system
Templates **M F S** · Traits `ruleSystem`
Tapas and boons, the astra system, mantras; the Force-less magic of Westeros (blood magic, warging, greensight), the magic of the Rings; Holtzman effect, prescience, the Voice, Mentat computation, protomolecule physics, Epstein drive physics.

| Field | Kind | Notes |
| --- | --- | --- |
| System kind | choice [magic, divine power, technology, psionics, biology, alchemy, ritual power, other] | |
| Source | long text | Tapas, the gods, spice, physics |
| Who can use it | long text | Born with it, trained, chosen, anyone with the device |
| How it is used | long text | Mantra, will, ritual, machine |
| Cost | long text | Every use must pay something |
| Limits | long text | What it can never do |
| Counters | long text | |
| Rules | list | Numbered, checkable rules; the continuity check cites them |
| Abilities in this system | →→ Ability / Power | |
| Practitioners ⏱ | →→ Character, Order / Society | |
| Learned at | →→ School / Gurukul / Academy | |
| Public knowledge | choice [common, known but rare, secret, forgotten] | |
| Interacts with | →→ Rule system | Shields + lasguns = atomic blast |
| Story purpose | long text | Writer's note: what it's for in the story |

### 85. Ability / Power / Technique
Templates **M F S** · Traits `ability`
Ichha Mrityu (as a power), shape-shifting, the third eye; warging, greensight, firebending, invisibility (the Ring); the Voice, prescience, Mentat trance, sandwalk, weirding.

| Field | Kind | Notes |
| --- | --- | --- |
| Rule system | → Rule system | |
| Ability kind | choice [offensive, defensive, perception, movement, transformation, mind, healing, creation, other] | |
| Effect | long text | |
| Requirements | long text | |
| Activation | long text | Mantra, gesture, trigger |
| Cost | long text | |
| Range | text | |
| Duration | text | |
| Cooldown / charges | text | |
| Counters | →→ Ability / Power, Astra | |
| Who has it ⏱ | →→ Character, Race / Species | |
| How it's learned | long text | |

### 86. Boon / Curse
Templates **M F S** · Traits `ability`
Ichha Mrityu, Kunti's mantra, Karna's curses from Parashurama and the Brahmin, Gandhari's curse on Krishna, the Curse of the Vasus, Pandu's curse; the curse on the Oathbreakers, Hodor's fate; the Harkonnen-Atreides kanly, genetic "curses" of bloodlines.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [boon, curse, blessing, geas, prophecy-bound fate] | |
| Granted / cast by | → Character, Deity | |
| On | →→ Character, Dynasty, Place | |
| Granted | date | |
| Reason | long text | |
| Exact wording | long text | Matters for loopholes |
| Effect | long text | |
| Conditions / trigger | long text | When it activates |
| Limits and loopholes | long text | |
| How it can be lifted | long text | |
| Rule system | → Rule system | |
| Status ⏱ | choice [dormant, active, triggered, fulfilled, lifted, broken] | |
| Fulfilled by | → Historical event | |

### 87. Vow / Oath / Pact
Templates **M F S**
The Terrible Vow (Bhishma Pratigya), Draupadi's vow on her hair, Bhima's vow; the Night's Watch oath, the Kingsguard vows, the Oath of Eorl, the Dead Men's oath to Isildur; Fremen water bonds, Belter oaths.

| Field | Kind | Notes |
| --- | --- | --- |
| Kind | choice [vow, oath of service, blood oath, celibacy vow, vengeance vow, marriage vow, pact, other] | |
| Sworn by | →→ Character | |
| Sworn to | →→ Character, Deity, Order / Society, Kingdom / Nation | |
| Sworn | date | |
| Exact words | long text | |
| Witnesses | →→ Character | |
| Binding force | text | Honour, divine, magical |
| Terms | list | |
| Penalty for breaking | long text | |
| Status ⏱ | choice [kept, strained, broken, fulfilled, released] | Continuity checks flag actions that break it |
| Consequences | links | `caused` |

### 88. Technology / Invention
Templates **S F M** · Traits `ruleSystem`
Vimanas (as myth-tech), Maya's architecture; Valyrian steel-forging, wildfire, Númenórean craft; the Epstein drive, Holtzman shields, foldspace navigation, the protomolecule, the Ring gates, juice (high-g drugs).

| Field | Kind | Notes |
| --- | --- | --- |
| Field | choice [propulsion, weapons, defence, medicine, computing, communication, energy, materials, agriculture, life support, architecture, other] | |
| Invented by | →→ Character, Race / Species, Guild / Corporation | |
| Invented | date | |
| How it works | long text | |
| Limits | long text | |
| Side effects / dangers | long text | |
| Requires | →→ Resource | |
| Controlled by ⏱ | →→ Guild / Corporation, Kingdom / Nation, Order | |
| Banned by | →→ Law / Code | Thou shalt not make a machine in the likeness of a human mind |
| Spread | choice [secret, monopoly, rare, common, lost] | |
| Changed the world by | long text | |
| Devices using it | →→ Device / Tool, Vehicle | |

### 89. Device / Tool / Gadget
Templates **M F S** · Traits `holdable`
Shakuni's dice, a weaver's loom, Draupadi's akshaya patra; palantíri (as devices), the Horn of Winter, the Night's Watch ravens kit; stillsuits, hand terminals, thumpers, maker hooks, paracompasses, the Weirding modules.

| Field | Kind | Notes |
| --- | --- | --- |
| Device kind | choice [tool, instrument, communication, navigation, survival, surveillance, medical, computing, magical device, other] | |
| Technology / rule system | → Technology, Rule system | |
| Made by | → Character, Guild / Corporation | |
| Function | long text | |
| How to use | long text | |
| Limits | long text | |
| Holder ⏱ | → Character | |
| Count ⏱ | number | For common items |
| Status ⏱ | choice [working, broken, lost, destroyed] | |

### 90. Artifact / Relic
Templates **M F S** · Traits `holdable`
Syamantaka jewel, Akshaya patra (also a device), Kaustubha; the Iron Throne, dragon eggs, the One Ring, the Silmarils, the Arkenstone; the Atreides ducal signet, the protomolecule sample, Shai-Hulud's tooth.

| Field | Kind | Notes |
| --- | --- | --- |
| Artifact kind | choice [jewel, crown, ring, vessel, throne, relic, egg, seal, sample, other] | |
| Made / found by | → Character, Race / Species, Deity | |
| Made | date | |
| Material | →→ Resource | |
| Powers | →→ Ability / Power | |
| Rules and curses | long text | What it does to its holder |
| Holder ⏱ | → Character | |
| Location ⏱ | → Place | |
| Lineage of holders | auto | From holder facts |
| Sought by | →→ Character, Faction | |
| Part of a set | →→ Artifact | The Rings of Power, the Silmarils, the Hufflepuff cup and its siblings |
| How it can be destroyed | long text | |
| Status ⏱ | choice [held, lost, hidden, stolen, destroyed, unmade] | |

### 91. Vehicle / Ship class
Templates **M F S**
Kinds of transport, not individuals: war chariot, vimana type; longship, galley; Corvette-class, Donnager-class battleship, Guild Heighliner, ornithopter model, carryall.

| Field | Kind | Notes |
| --- | --- | --- |
| Class kind | choice [chariot, cart, ship, boat, airship, spacecraft, ornithopter, crawler, mount-carriage, other] | |
| Built by | →→ Guild / Corporation, Culture | |
| Size | quantity | |
| Crew | composition | |
| Capacity | text | |
| Speed | quantity | Feeds travel-time checks |
| Range | quantity | |
| Propulsion | → Technology | |
| Armament | →→ Weapon, Siege engine | |
| Defences | →→ Armour / Shield | |
| Used by | →→ Force, Kingdom / Nation, Guild | |
| Count in service ⏱ | number | |

### 92. Vehicle / Ship
Templates **M F S** · Traits `holdable`, `locatable`
Named individuals: Arjuna's chariot (Nandighosha), the Pushpaka vimana; Black Betha, the White Ship, Elendil's ships; the Rocinante, the Canterbury, the Donnager, the Behemoth / Nauvoo.

| Field | Kind | Notes |
| --- | --- | --- |
| Class | → Vehicle / Ship class | |
| Owner ⏱ | → Character, Faction, Guild / Corporation | |
| Captain / charioteer ⏱ | → Character | Krishna as Arjuna's charioteer |
| Crew ⏱ | →→ Character | |
| Built | date | |
| Former names | list | Tachi → Rocinante |
| Registry / flag ⏱ | → Kingdom / Nation, Faction | |
| Location ⏱ | → Place | |
| Armament ⏱ | →→ Weapon | |
| Modifications ⏱ | list | |
| Condition ⏱ | choice [pristine, damaged, crippled, repaired, destroyed] | |
| Notable deeds | →→ Historical event | |

### 93. Transport method
Templates **M F S** · Traits `transport`
How people travel, with speeds the app uses for travel-time checks: on foot, horse, chariot, river boat, vimana; ship, raven (for messages), dragonback; Epstein-drive burn, foldspace, gate transit, sandworm riding.

| Field | Kind | Notes |
| --- | --- | --- |
| Carries | multi [people, goods, armies, messages] | Messages feed communication-speed checks |
| Speed | quantity | Per day or per hour, in project units |
| Terrain allowed | multi [road, rough, mountain, forest, desert, river, sea, air, space, any] | |
| Terrain penalties | long text | |
| Range limit | quantity | |
| Requires | →→ Vehicle / Ship class, Creature species, Technology, Resource | |
| Cost | text | |
| Available to | →→ Social class, Culture, Faction | |
| Dangers | long text | High-g, worms, storms |
| Special rules | long text | Foldspace is instant; gates need speed limits |

---

## Group: Story
Narrative types. These describe the story, not the world, and are never treated as in-world fact.

### 94. Theme
Templates **M F S**
Dharma vs. duty, the cost of a vow, power and legitimacy, colonialism, ecology, messianic danger.

| Field | Kind | Notes |
| --- | --- | --- |
| Statement | long text | What the story says about it |
| Question it asks | text | |
| Expressed through | →→ Character, Storyline, Motif | |
| Counter-argument | long text | Who embodies the other side |
| Key scenes | narrative refs | Tagged scenes show where it recurs |
| Works | →→ Work | Themes can differ by telling |

### 95. Motif / Recurring image
Templates **M F S**
Narrative motifs, not in-world symbols: falling petals at vows, rivers as mothers, wolves and lions, water as life.

| Field | Kind | Notes |
| --- | --- | --- |
| Description | long text | |
| Meaning | long text | |
| Tied to | →→ Theme, Character | |
| Appearances | narrative refs | |
| Visual treatment | long text | For screen: colour, framing, sound |

### 96. Setup / Payoff
Templates **M F S** · Traits `setup`
Chekhov's guns: Karna's armour, the Chakravyuha knowledge gap, Shikhandi's birth; Jon's parentage, the dragonglass; Paul's dreams, the Rocinante's last torpedo.

| Field | Kind | Notes |
| --- | --- | --- |
| What is planted | long text | |
| Planted at | narrative refs | Per work |
| Hints / reminders | narrative refs | |
| Payoff | long text | Planned payoff |
| Paid off at | narrative refs | Empty = unpaid; flagged near a finale |
| Related entries | →→ any | |
| Status ⏱ | choice [planted, hinted, paid off, dropped, subverted] | |
| Audience knowledge | text | What viewers know at each stage |

### 97. Mystery / Open question
Templates **M F S**
Who is Karna's mother? Who poisoned Jon Arryn? Who sent the assassin? What are the gates for?

| Field | Kind | Notes |
| --- | --- | --- |
| Question | text | As the audience would ask it |
| Answer | long text | Writer's truth |
| Clues | list | With narrative refs |
| Red herrings | list | |
| Raised at | narrative refs | |
| Answered at | narrative refs | |
| Characters investigating ⏱ | →→ Character | |
| Status ⏱ | choice [open, partly answered, solved, abandoned] | |

### 98. Secret
Templates **M F S** · Traits `secret`
Karna is Kunti's son; Shikhandi's origin; Jon is a Targaryen; Cersei's children; Jessica is a Harkonnen; the protomolecule's origin.

| Field | Kind | Notes |
| --- | --- | --- |
| The truth | long text | |
| About | →→ any | |
| Kept by ⏱ | →→ Character | |
| Known to ⏱ | links | `knows` links with story time; flags characters acting on knowledge they don't have yet |
| Revealed to audience at | narrative refs | Can differ from when characters learn it |
| Revealed in-world at | → Historical event | |
| Evidence | list | |
| Cost if revealed | long text | |
| Status ⏱ | choice [kept, suspected, partly revealed, revealed] | |

### 99. Account / Source
Templates **M F S** · Traits `account`
In-world versions of history: Sanjaya's narration, Vyasa's telling; Mushroom's testimony vs. Septon Eustace vs. Grand Maester Munkun; Princess Irulan's histories, OPA propaganda.

| Field | Kind | Notes |
| --- | --- | --- |
| Narrator | → Character, Text / Book | |
| Point of view | text | Allegiance, bias |
| Reliability | choice [reliable, biased, unreliable, propaganda, contradictory] | |
| Covers | →→ Historical event, War / Conflict, Era | |
| Contradicts | →→ Account / Source | |
| Known to | →→ Culture, Character | |
| Writer's note | long text | What is actually true |

### 100. Quest / Mission
Templates **M F S**
The search for the Pandavas in exile, the quest for the Parijata tree; destroying the Ring, the hunt for Arya; Paul's escape into the desert, Holden's missions.

| Field | Kind | Notes |
| --- | --- | --- |
| Objective | long text | |
| Given by | → Character, Order / Society, Deity | |
| Undertaken by ⏱ | →→ Character, Force, Vehicle / Ship | |
| Starts / ends | date span | |
| Route | →→ Place, Route / Road | |
| Obstacles | list | |
| Stakes | long text | |
| Outcome | long text | |
| Status ⏱ | choice [not started, in progress, failed, succeeded, abandoned] | |

### 101. Concept / Lore note
Templates **M F S**
The catch-all for anything that isn't a better-fitting type: cosmological principles (karma, the wheel of time), philosophical schools, world rules that aren't systems, "how the world works" notes. Use sparingly; promote to a proper type when it grows fields.

| Field | Kind | Notes |
| --- | --- | --- |
| Category | text | Free label |
| Explanation | long text | |
| Related | →→ any | |
| Rules it implies | list | |

---

## Link types (per template)

Built into every template unless marked. Each has a kind (used for colour, filters and the family tree) and a reverse label.

| Link | Reverse | Kind | Templates |
| --- | --- | --- | --- |
| parent of | child of | kinship | M F S |
| married to | married to | kinship | M F S |
| sibling of | sibling of | kinship | M F S |
| half-sibling of | half-sibling of | kinship | M F S |
| foster parent of | fostered by | kinship | M F S |
| born of (niyoga, divine father) | fathered | kinship | M F |
| ward of | guardian of | kinship | M F S |
| lover of | lover of | relation | M F S |
| betrothed to | betrothed to | relation | M F S |
| friend of | friend of | relation | M F S |
| ally of | ally of | relation | M F S |
| rival of | rival of | relation | M F S |
| enemy of | enemy of | relation | M F S |
| at war with | at war with | relation | M F S |
| serves | served by | relation | M F S |
| sworn to | has sworn | relation | M F S |
| protects | protected by | relation | M F S |
| betrayed | betrayed by | relation | M F S |
| killed | killed by | relation | M F S |
| member of | has member | membership | M F S |
| leads | led by | membership | M F S |
| vassal of | liege of | membership | M F S |
| taught | student of | teaching | M F S |
| learned from | taught | teaching | M F S |
| knows (secret, astra, formation) | known by | knowledge | M F S |
| holds / owns | held by | ownership | M F S |
| rules | ruled by | ownership | M F S |
| grants (boon, title) | granted by | ownership | M F S |
| created | created by | ownership | M F S |
| worships | worshipped by | relation | M F S |
| avatar of | has avatar | relation | M F |
| located in | contains | location | M F S |
| capital of | has capital | location | M F S |
| borders | borders | location | M F S |
| flows through | has river | location | M F |
| orbits | orbited by | location | S |
| connects (gate, route) | connected by | location | M F S |
| caused | caused by | causal | M F S |
| triggers | triggered by | causal | M F S |
| enables | enabled by | causal | M F S |
| prevents | prevented by | causal | M F S |
| contradicts (account) | contradicted by | narrative | M F S |
| foreshadows | foreshadowed by | narrative | M F S |
| mirrors / parallels | mirrors | narrative | M F S |
| part of | has part | relation | M F S |

---

## Template settings

### Mythological epic (M)
- **Sidebar groups:** Land, Civilisation, War, Rule systems, Story.
- **Calendar:** Yuga-based. Eras: Satya, Treta, Dwapara, Kali. Months: Chaitra to Phalguna (12 lunar months of 30 days), with an optional adhika (extra) month. Display: `{day} {month}, {year} Dwapara`.
- **Units of distance:** angula, hasta, dhanus, krosha (≈ 2,000 dhanus), yojana (≈ 4 krosha).
- **Units of force:** patti, senamukha, gulma, gana, vahini, prtana, chamu, anikini, akshauhini.
- **Work structures:** Series (Season → Episode), Epic (Parva → Chapter), Film.

### Epic fantasy (F)
- **Sidebar groups:** Land, Civilisation, War, Rule systems, Story.
- **Calendar:** one era pair (e.g. "BC / AC" from a founding event), 12 months, 7-day weeks. Seasons are irregular and live as Natural phenomenon entries.
- **Units of distance:** foot, league, mile, day's ride.
- **Units of force:** banner, company, host, éored.
- **Work structures:** Series (Season → Episode), Novel (Book → Part → Chapter), Trilogy (Film).

### Space opera (S)
- **Sidebar groups:** Space, Worlds, Civilisation, Fleet & War, Technology, Story.
- **Calendar:** standard years with an era from a founding event (e.g. "AG — After Guild"), plus ship time.
- **Units of distance:** km, AU, light-year, parsec, gate jump.
- **Units of force:** ship, squadron, battle group, fleet, legion.
- **Work structures:** Series (Season → Episode), Novel series (Book → Chapter), Film.

### Blank
No types except Character, Place (a generic location using the Region fields), Event and Concept / Lore note. One calendar with a single era. Build everything else yourself.

---

## Coverage check

Every category from your reference lists, and where it lives:

| Your category | Type(s) |
| --- | --- |
| Geography & locations | Realm, World, Star system, Celestial body, Station, Continent, Region, Landform, Biome |
| Cities | City |
| Kingdoms / countries / territories | Kingdom / Nation / Territory |
| Forests | Forest / Jungle |
| Rivers & oceans | River, Sea / Ocean / Lake |
| Mountains | Mountain / Range / Pass |
| Flora and fauna | Plant / Flora, Creature species, Named creature |
| Dynasties | Dynasty / Noble house |
| History and mythology | Historical event, Era / Age, Myth / Legend, Account / Source |
| Races & cultures / species | Race / Species, Culture / People |
| Huts | Dwelling / Home |
| Gurukuls / education | School / Gurukul / Academy, Discipline / Field of knowledge |
| Historical figures | Character (prominence + era) |
| Travelling & unit of distance | Transport method, Route / Road, project units |
| Battlefields | Battlefield |
| Checkpoints & chokepoints | Checkpoint / Chokepoint |
| Watchtowers | Watchtower / Outpost |
| Warfare | War / Conflict, Battle / Siege, Force, Unit type, Battle formation, Siege engine, Treaty |
| Weapons & offence | Weapon, Astra, Armour / Shield |
| Forts & strongholds | Fort / Stronghold |
| Artifacts | Artifact / Relic |
| Mythical creatures | Mythical creature |
| Warrior classes | Warrior class / Rank |
| Languages & writing systems | Language, Script, Term / Glossary entry |
| Art, literature, entertainment | Art / Song / Story, Text / Book, Game / Sport / Contest |
| Magic systems | Rule system, Ability / Power, Boon / Curse, Vow / Oath |
| Prophecies & omens | Prophecy / Omen, Natural phenomenon |
| Health, medicines & healing | Disease / Affliction, Medicine / Remedy / Poison / Drug |
| Politics, government, power | Government / Council, Position / Title, Faction, Kingdom |
| Social hierarchy & class | Social class / Caste, Profession |
| Religion, mythology, cosmology | Religion / Faith, Deity, Realm / Plane, Sacred site, Ritual, Concept |
| Symbols & iconography | Symbol / Sigil, Motif |
| Laws, crime & punishment | Law / Code, Custom / Tradition / Taboo |
| Calendar & time | Project calendars, Era / Age, Festival |
| Food & cuisine | Food / Drink |
| Fashion & attire | Attire / Clothing |
| Economics & trade | Currency, Resource, Guild / Corporation, Route / Road, Port |
| Technology & innovations | Technology, Device / Tool |
| Transportation & communication | Transport method, Vehicle class, Vehicle, Watchtower (signals), Gate |
| Historical events & timeline | Historical event (timeline view) |
| Maps & resources | Maps (uploads), Resource |
| Story bible: characters, themes, structure | Character, Theme, Motif, Setup / Payoff, Mystery, Secret, Quest |
| Glossary | Term / Glossary entry |
