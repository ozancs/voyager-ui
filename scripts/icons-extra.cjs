// Builds src/icons-extra.js: the Lucide icons (ISC licence) offered in the icon pickers, cut down to the ones that
// make sense for a printer UI (heat, fans, light, tools, motion, files, status...). Run with the path of an unpacked
// lucide-static package:   node scripts/icons-extra.cjs /tmp/lucide-static/package
const fs = require('fs'),
  path = require('path');
const dir = process.argv[2];
if (!dir) {
  console.error('usage: node scripts/icons-extra.cjs <lucide-static package dir>');
  process.exit(1);
}
const tags = require(path.resolve(dir, 'tags.json')),
  nodes = require(path.resolve(dir, 'icon-nodes.json'));
const ver = require(path.resolve(dir, 'package.json')).version;
const NAME = new Set(
  'printer,fan,wind,thermometer,flame,snowflake,heater,lightbulb,lamp,sun,moon,power,plug,battery,zap,play,pause,square,circle-stop,house,home,move,rotate,refresh,layers,box,boxes,package,scissors,brush,paintbrush,droplet,droplets,gauge,timer,clock,alarm,bell,camera,video,webcam,wifi,cpu,microchip,memory,server,database,hard,settings,cog,wrench,hammer,drill,ruler,crosshair,target,magnet,filter,sparkle,sparkles,star,heart,flag,check,circle-check,alert,triangle-alert,info,file,folder,save,download,upload,trash,lock,unlock,key,shield,eye,search,grid,axis,scale,weight,cylinder,cone,cuboid,pyramid,torus,hexagon,triangle,shapes,pen,pencil,pipette,flask,test,atom,waves,vibrate,activity,chart,trending,terminal,code,bug,rocket,wand,repeat,skip,fast,volume,bed,door,air,vent,recycle,leaf,coffee,cable,usb,radio,antenna,compass,navigation,anchor,trophy,award,gift,tag,bookmark,book,notebook,clipboard,history,undo,redo,archive,send,link,expand,shrink,minimize,maximize,scan,qr,fingerprint,sliders,toggle,dial,arrow,chevrons,move,locate,thermometer-sun,heater,air-vent,cooking,fire,factory,construction,hard-hat,shovel,axe,pickaxe,paint,palette,swatch,spray,biohazard,radiation,siren,megaphone,speaker,headphones,monitor,tv,tablet,smartphone,laptop,keyboard,mouse,gamepad,joystick,bot,brain,puzzle,dices,dice,ghost,skull,smile,frown,party,cake,beer,pizza,candy,cat,dog,bird,fish,bug,rabbit,turtle,snail,sprout,flower,tree,mountain,cloud,umbrella,tornado,rainbow,hourglass,calendar,list,layout,panel,columns,rows,table,kanban,blocks,component,frame,crop,scaling,group,ungroup,merge,split,combine,spline,vector,bezier,pen-tool,ruler,square-dashed,dot,circle-dot,disc,disc-3,cylinder,container,warehouse,store,shopping,truck,forklift,conveyor,cog,shield-check,badge,medal,crown,gem,diamond,infinity,sigma,percent,hash,binary,variable,function,calculator,clipboard-check,list-checks,circle-play,circle-pause,circle-stop,rotate-ccw,rotate-cw,refresh-ccw,refresh-cw,undo-2,redo-2,log-in,log-out,power-off,plug-zap,unplug,battery-charging,sun-snow,thermometer-snowflake,flame-kindling,heater,wind-arrow-down,fan,air-vent,droplet-off,ban,octagon,circle-x,x,plus,minus,equal,circle-plus,circle-minus,house-plug,lightbulb-off,flashlight,lamp-desk,lamp-ceiling,spotlight,brightness,contrast,aperture,focus,scan-line,scan-eye,view,eye-off,binoculars,microscope,telescope,satellite,globe,map,map-pin,route,signpost,milestone'.split(
    ',',
  ),
);
const BAD =
  /^(a-|text|heading|pilcrow|italic|bold|underline|strikethrough|subscript|superscript|ligature|case|letter|remove-formatting|whole-word|regex|spell|wrap|list-(ordered|tree|restart|video|music|end|start|x|plus|minus|filter|collapse)|file-(type|code|json|spreadsheet|volume|audio|music|video|image|archive|axis|badge|box|chart|clock|cog|diff|digit|heart|key|lock|minus|pen|plus|question|scan|search|signature|sliders|stack|symlink|terminal|text|user|warning|x|check|input|output)|folder-(git|kanban|dot|code|symlink|archive|clock|cog|heart|key|lock|minus|open-dot|pen|plus|root|search|sync|tree|up|down|x|check|input|output)|square-(arrow|chevron|m|pi|sigma|split|slash|bottom|dashed-bottom|function|parking|percent|power|radical|scissors|star|stack|terminal|user|library|kanban|mouse|pen|pause|play|stop|plus|minus|x|equal|divide|asterisk|code|dot|check|activity|menu|split)|circle-(arrow|chevron|fading|parking|slash|power|pound|dollar|euro|gauge|help|divide|equal|percent|pi|small|user|ellipsis|off|dashed|star)|arrow-(big|down-(a|z|0|1|narrow|wide|left-from|right-from|to)|up-(a|z|0|1|narrow|wide|left-from|right-from|to|from)|left-(from|to)|right-(from|to))|calendar-(arrow|check|clock|cog|days|fold|heart|minus|off|plus|range|search|sync|x|1)|chart-(no|column-(big|dec|inc|stacked)|bar-(big|dec|inc|stacked)|candlestick|gantt|network|spline|scatter)|bookmark-(check|minus|plus|x)|book-(a|alert|audio|check|copy|dashed|down|headphones|heart|image|key|lock|marked|minus|open-check|open-text|plus|search|text|type|up|user|x)|clipboard-(copy|minus|paste|pen|plus|type|x|clock|list)|tag-|badge-(cent|dollar|euro|indian|japanese|pound|russian|swiss|turkish)|candy|beer|cake|lock-(keyhole|open)|message|mail|user|users|contact|id-|hand|thumbs|shopping|wallet|banknote|coins|credit|piggy|receipt|landmark|euro|dollar|pound|bitcoin|indian|japanese|russian|swiss|turkish|philippine|saudi|currency|git|github|gitlab|figma|framer|chrome|codepen|codesandbox|dribbble|facebook|instagram|linkedin|slack|trello|twitch|twitter|youtube|pocket|rail|train|tram|bus|car|bike|ship|sailboat|plane|cable-car|caravan|tractor|ambulance|baby|bath|bone|briefcase|church|cigarette|clapperboard|club|cross|dna|drama|dumbbell|ear|egg|fence|ferris|fish|gavel|glasses|hand|hospital|hotel|ice-cream|kayak|lollipop|mars|venus|non-binary|pill|popcorn|sandwich|school|shirt|shrub|soup|stethoscope|syringe|tent|theater|ticket|toilet|trees|vegan|wine|wheat|croissant|dessert|donut|drumstick|ham|hop|martini|milk|nut|salad|beef|apple|banana|cherry|citrus|grape|carrot|bean|cookie|cup|utensils|chef|refrigerator|washing|microwave|heading|tally|sigma|pi|omega|radical|square-radical|diameter|variable|parentheses|brackets|braces|regex|quote|superscript)/;
const names = Object.keys(nodes).filter((n) => {
  if (BAD.test(n)) return false;
  const p = n.split('-');
  return NAME.has(n) || NAME.has(p[0]) || NAME.has(p.slice(0, 2).join('-'));
});
const svg = (n) =>
  nodes[n]
    .map(
      ([t, a]) =>
        '<' +
        t +
        Object.entries(a)
          .filter(([k]) => k !== 'key')
          .map(([k, v]) => ' ' + k + '="' + v + '"')
          .join('') +
        '/>',
    )
    .join('');
const out = {};
for (const n of names) out[n] = [svg(n), (tags[n] || []).slice(0, 8).join(' ')];
fs.writeFileSync(
  path.join(__dirname, '../src/icons-extra.js'),
  `// Lucide icons v${ver}, https://lucide.dev, ISC licence (see LICENSE-lucide). Generated by scripts/icons-extra.cjs\n` +
    '// name: [svg inner markup, search words]\n' +
    'export default ' +
    JSON.stringify(out) +
    '\n',
);
console.log(names.length, 'icons');
