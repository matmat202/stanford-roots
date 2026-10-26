# Stanford Roots

**<https://matmat202.github.io/stanford-roots/>**

A world map of where Stanford's people were born. Tap a country, or pick it from the
list, to see everyone from it: name, what they did, birth year and birthplace, each
linked to Wikipedia (or to Wikidata when there is no English article). Search works
within a country or across all of them: try *physicist*, *Lagos* or *Nobel*.

## Where the people come from

[Wikidata](https://www.wikidata.org/) (CC0): everyone with **educated at** (P69) Stanford
University or one of its degree-granting schools (GSB, Law, Medicine, Engineering,
Education, Hopkins Marine Station), and a **place of birth** (P19). Wikidata keeps the
schools as separate items, and 353 people are reachable only through one of them,
mostly GSB and Law. That makes about 5,200 people from 116 countries.

The country is the birthplace's country as Wikidata records it today. Birthplaces filed
under a state that no longer exists are folded into its modern successor by an explicit
table in `build.py` (Pahlavi and Qajar Iran → Iran, the German Reich → Germany, the Qing
dynasty → China). States with no single successor, like the British Raj, stay as
themselves: listed, not on the map. Where Wikidata gives two countries for one birthplace
(Jerusalem, for example), the person is counted in both.

## US states

Three quarters of everyone was born in the US, which the world map can only show as one
country. Pick the US and a second map breaks it down by state. Each US birthplace is
walked up Wikidata's "located in" chain (P131) to one of the 50 states or D.C. That
places 98% of the US-born. The rest were born "in the United States" with nothing more
specific, or in Puerto Rico, Guam or American Samoa; they stay on the US list but are on
no state. The two views differ here as well: California is about a third of the US-born
who studied at Stanford but a seventh of those who worked there, and New York is the
other way round.

## What it cannot tell you

Wikidata is volunteer-edited. It over-represents the famous and the American, and someone
missing here may just have no birthplace recorded, or no English label (211 records
are left out for that reason). A few records are plainly wrong. Births before 1891 are
often real, though: Stanford's medical school grew out of Cooper Medical College.

Map: Natural Earth 1:110m via [world-atlas](https://github.com/topojson/world-atlas),
Equal Earth projection. Countries too small for that scale (Singapore, Malta) get a dot.
States: US Census via [us-atlas](https://github.com/topojson/us-atlas), Albers USA.

Not affiliated with Stanford University. Built by Claude.
