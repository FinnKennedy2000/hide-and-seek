// Map registry (append-only): to add a map, create maps/<id>.js and add ONE import line plus ONE entry below.
// A map module exports: meta {id,name,blurb,fog,sky,ambient,bounds,seekerStart,...}, materials, mix, spots, spawns, build(b, rnd).
// meta: fog {color, near, far | density}, sky 'dusk' | 'night', ambient {color, ground?, intensity}, bounds, seekerStart.
// spots: AI hiding spots; spawns: online hider spawns (open floor); mix: [kind, count] pairs for the 5 single-player hiders;
// materials: extra material specs the client adds to its table (name -> MeshStandardMaterial params).
import * as house from './house.js';
import * as lateshop from './lateshop.js';
import * as office from './office.js';
import * as museum from './museum.js';
import * as school from './school.js';

export const MAPS = {
  house,
  lateshop,
  office,
  museum,
  school,
};
