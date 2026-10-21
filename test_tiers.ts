import { generateDome } from './src/core/dome';

const p = {
  diameter: 8000,
  shapeType: 'ellipsoid' as const,
  ellipsoidLengthX: 10000,
  ellipsoidWidthY: 6000,
  ellipsoidHeightZ: 3500,
  frequency: 5 as any,
  height: 3500,
  cutType: '1/2' as const,
  levelBaseHorizon: true,
  tierLeveling: {
    3: {
      level: 3,
      enabled: true,
      radialMode: 'vertical' as const
    }
  }
};

const d = generateDome(p);
const t3 = d.tiers?.find(t => t.level === 3);
console.log('Tier 3 with vertical:', t3);
const nodes3 = d.nodes.filter(n => n.tierLevel === 3);
console.log('Nodes in tier 3 Zs:', [...new Set(nodes3.map(n => n.position.z))]);
console.log('Nodes in tier 3 isTierLeveled:', nodes3.map(n => n.isTierLeveled).slice(0, 5));

// What if radialMode is uniform_radius?
p.tierLeveling[3].radialMode = 'uniform_radius';
const d2 = generateDome(p);
const nodes3_uniform = d2.nodes.filter(n => n.tierLevel === 3);
console.log('\n--- With uniform_radius ---');
console.log('X range:', Math.min(...nodes3_uniform.map(n => n.position.x)), Math.max(...nodes3_uniform.map(n => n.position.x)));
console.log('Y range:', Math.min(...nodes3_uniform.map(n => n.position.y)), Math.max(...nodes3_uniform.map(n => n.position.y)));

// What if radialMode is spherical?
p.tierLeveling[3].radialMode = 'spherical';
const d3 = generateDome(p);
const nodes3_sph = d3.nodes.filter(n => n.tierLevel === 3);
console.log('\n--- With spherical ---');
console.log('X range:', Math.min(...nodes3_sph.map(n => n.position.x)), Math.max(...nodes3_sph.map(n => n.position.x)));
console.log('Y range:', Math.min(...nodes3_sph.map(n => n.position.y)), Math.max(...nodes3_sph.map(n => n.position.y)));
