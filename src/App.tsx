import React from 'react';
import './App.css';
import { Degree, Radians, asDegree, asRadians } from './units';
import { mat4, quat, vec3, mat3 } from 'gl-matrix';
import { KinematicsCanvas } from './Canvas';

function diff(i: number, j: number, linkages: vec3[]): vec3 {
  return vec3.sub(vec3.create(), linkages[i], linkages[j]);
}

function dump(v: vec3) {
  return `(${v[0].toFixed(3)}, ${v[1].toFixed(3)}, ${v[2].toFixed(3)})`;
}

function get_q(view: vec3, right: vec3, pitch: Radians, rotate: Radians) {
  const qview = quat.setAxisAngle(quat.create(), view, rotate);
  const qright = quat.setAxisAngle(quat.create(), right, pitch);
  quat.mul(qview, qview, qright);
  return qview;
}

/**
 * calculate the projection of v onto a plane with normal n
 * @param v 
 * @param n 
 * @returns 
 */
function proj(v: vec3, n: vec3) {
  const n1 = vec3.normalize(vec3.create(), n);
  vec3.scale(n1, n1, vec3.dot(v, n1));
  return vec3.sub(n1, v, n1);
}

function angles(view: vec3, up: vec3, right: vec3) {
  return [asDegree(vec3.angle(view, up) as Radians), asDegree(vec3.angle(view, right) as Radians), asDegree(vec3.angle(right, up) as Radians)] as const;
}

function fiveZeroRadians() {
  return [0 as Radians, 0 as Radians, 0 as Radians, 0 as Radians, 0 as Radians];
}

/**
 * Cyclic Coordinate Descent (CCD) method to solve IK
 * @param linkages 
 * @param target 
 * @param pitches 
 * @param rotates 
 * @returns 
 */
function ikSolve(linkages: vec3[], target: vec3, pitches: Radians[], rotates: Radians[], lengths: number[], eps: number = 1e-3) {
  if (vec3.dist(linkages[linkages.length - 1], target) < eps) {
    return 0;
  }
  const endEffector = vec3.clone(linkages[linkages.length - 1]);
  const qs = [] as quat[];
  for (let i = linkages.length - 1; i >= 1; i--) {
    // if (i < linkages.length - 2) {
    //   qs[i] = quat.identity(quat.create());
    //   continue;
    // }
    const v1 = vec3.sub(vec3.create(), endEffector, linkages[i - 1]);
    const v2 = vec3.sub(vec3.create(), target, linkages[i - 1]);
    if (vec3.length(v2) < eps) {
      qs[i] = quat.identity(quat.create());
      continue;
    }
    const n1 = vec3.normalize(vec3.create(), v1);
    const n2 = vec3.normalize(vec3.create(), v2);
    console.log('v1:', dump(v1), 'v2:', dump(v2));
    console.log('n1:', dump(n1), 'n2:', dump(n2));
    qs[i] = quat.rotationTo(quat.create(), n1, n2);
    quat.normalize(qs[i], qs[i]);
    console.log(`${qs[i]} * v1:`, dump(vec3.transformQuat(vec3.create(), v1, qs[i])));
    console.log(`${qs[i]} * n1:`, dump(vec3.transformQuat(vec3.create(), n1, qs[i])));
    const endEffectorDiff = vec3.sub(vec3.create(), endEffector, linkages[i - 1]);
    vec3.transformQuat(endEffectorDiff, endEffectorDiff, qs[i]);
    vec3.add(endEffector, linkages[i - 1], endEffectorDiff);
    console.log('endEffector:', dump(endEffector), 'target:', dump(target), 'diff:', vec3.dist(endEffector, target));
  }

  const r = mat4.create();
  // const zero = vec3.zero(vec3.create());
  // const one = vec3.fromValues(1, 1, 1);
  mat4.identity(r);
  for (let i = linkages.length - 1; i >= 1; i--) {
    for (let j = i; j < linkages.length; j++) {
      const linkagesDiff = vec3.sub(vec3.create(), linkages[j], linkages[i - 1]);
      vec3.transformQuat(linkagesDiff, linkagesDiff, qs[i]);
      vec3.add(linkages[j], linkages[i - 1], linkagesDiff);
    }
    // const m = mat4.fromRotationTranslationScaleOrigin(mat4.create(), qs[i], zero, one, linkages[i - 1]);
    // mat4.mul(r, m, r); // caution: mat4.mul(r, r, m) is wrong
    // console.log('r:', r);
    // console.log(r[0], r[4], r[8], r[12]);
    // console.log(r[1], r[5], r[9], r[13]);
    // console.log(r[2], r[6], r[10], r[14]);
    // console.log(r[3], r[7], r[11], r[15]);
    // vec3.transformMat4(linkages[i], linkages[i], r);
    // console.log(`i=${i}`, `linkages[${i}]=`, dump(linkages[i]));
  }
  console.assert(vec3.equals(linkages[linkages.length - 1], endEffector), 'endEffector:', dump(endEffector), `linkages[${linkages.length - 1}]:`, dump(linkages[linkages.length - 1]));
  const e = vec3.dist(linkages[linkages.length - 1], target);
  if (e < eps) {
    return e;
  }
  const up = vec3.fromValues(0, 1, 0);
  const view = vec3.fromValues(1, 0, 0);
  for (let i = 1; i < linkages.length; i++) {
    const origin = linkages[i - 1];
    const right = vec3.cross(vec3.create(), view, up);
    const view1 = diff(i, i - 1, linkages);
    vec3.normalize(view1, view1);
    vec3.scale(view1, view1, lengths[i - 1]);
    pitches[i] = vec3.angle(view, view1) as Radians;
    const p = proj(view1, view);
    if (vec3.length(p) < eps) {
      rotates[i] = 0 as Radians;
    } else {
      rotates[i] = vec3.angle(up, p) as Radians;
      if (vec3.dot(right, p) < 0) {
        rotates[i] = -rotates[i] as Radians;
      }
    }
    console.log(`p[${i}]:`, dump(p));
    
    console.log(`pitch[${i}]:`, asDegree(pitches[i]), `rotate[${i}]:`, asDegree(rotates[i]));
    const q = get_q(view, right, pitches[i], rotates[i]);
    vec3.transformQuat(up, up, q);
    vec3.normalize(up, up);
    console.log(`up[${i}]:`, dump(up));
    vec3.copy(view, view1);
    
  }
  return e;
}

function finiteOr(x: number, alt: number = 0) {
  return isFinite(x) ? x : alt;
}

function fk(pitches: Radians[], rotates: Radians[], lengths: number[]) {
  const newLinkages = [vec3.fromValues(0, 0, 0)];
  const up = vec3.fromValues(0, 1, 0);
  let view = vec3.fromValues(1, 0, 0);
  for (let i = 1; i <= lengths.length; i++) {
    const origin = newLinkages[i - 1];
    const right = vec3.cross(vec3.create(), view, up);
    const q = get_q(view, right, pitches[i], rotates[i]);
    vec3.normalize(view, view);
    const view1 = vec3.scale(vec3.create(), view, lengths[i - 1]);
    vec3.transformQuat(view1, view1, q);
    newLinkages[i] = vec3.clone(view1);
    // console.log(`i=${i}`, 'up:', Array.from(up), ', view:', Array.from(view), ...angles(view, up, right));
    newLinkages[i] = vec3.add(newLinkages[i], newLinkages[i], origin);
    vec3.transformQuat(up, up, q);
    vec3.normalize(up, up);
    vec3.copy(view, view1);
  }
  console.assert(newLinkages.length === 1 + lengths.length);
  return newLinkages;
}


function App() {
  const [mode, setMode] = React.useState<'FK' | 'IK'>('FK');
  const [selectedLinkage, setSelectedLinkage] = React.useState(1);
  const [lengths, setLengths] = React.useState<number[]>([1, 1, 1, 1]);
  const [rotates, setRotates] = React.useState<Radians[]>(fiveZeroRadians());
  const [pitches, setPitches] = React.useState<Radians[]>(fiveZeroRadians());
  const [target, setTarget] = React.useState<vec3 | null>(null);

  const linkages = React.useMemo(() => {
    return fk(pitches, rotates, lengths);
  }, [pitches, rotates]);

  const endEffector = React.useMemo(() => linkages[linkages.length - 1], [linkages]);

  React.useEffect(() => {
    if (mode === 'IK' && target) {
      const newPitches = pitches.slice();
      const newRotates = rotates.slice();
      const newLinkages = linkages.slice();
      for (let _ = 0; _ < 10; _++) {
        const e = ikSolve(newLinkages, target, newPitches, newRotates, lengths)
        if (e < 1e-3) {
          console.log('IK solved', e);

          break;
        } else {
          console.log('error:', e);
        }
      }
      setPitches(newPitches);
      setRotates(newRotates);
    }
  }, [mode, target]);

  return (
    <>
      <h1>iscg2024-assignment-a1: 3D Kinematics</h1>
      <KinematicsCanvas config={mode === 'FK' ? { mode, linkages, selectedLinkage } : { mode, linkages, selectedLinkage, target: target! }} canvasSize={[640, 480]} />
      <div>
        Selected Linkage: <select value={selectedLinkage} onChange={(e) => {
          const i = parseInt(e.target.value);
          if (i !== selectedLinkage) {
            // setLinkages(currentLinkages);
            // setUps(currentUps);
            setSelectedLinkage(i);
          }
        }}>
          {linkages.map((_, i) => i !== 0 && <option key={i} value={i}>{i}</option>)}
        </select>
      </div>
      <div>
        Mode: <select value={mode} onChange={(e) => {
          setMode(e.target.value as 'FK' | 'IK')
          if (e.target.value === 'IK') {
            setTarget(vec3.clone(endEffector));
          } else {
            setTarget(null);
          }
        }}>
          <option value="FK">Forward Kinematics</option>
          <option value="IK">Inverse Kinematics</option>
        </select>
      </div>
      {mode === 'FK' && <div>
        Pitch: <input type="range" min={0} max={180} value={asDegree(pitches[selectedLinkage])} onChange={(e) => {
          const pitch = parseFloat(e.target.value) as Degree;
          const newPitches = pitches.slice();
          newPitches[selectedLinkage] = asRadians(pitch);
          setPitches(newPitches);
        }} /> {asDegree(pitches[selectedLinkage]).toFixed(3)}°
      </div>}
      {mode === 'FK' && <div>
        Rotate: <input type="range" min={-180} max={180} value={asDegree(rotates[selectedLinkage])} onChange={(e) => {
          const rotate = parseFloat(e.target.value) as Degree;
          const newRotates = rotates.slice();
          newRotates[selectedLinkage] = asRadians(rotate);
          setRotates(newRotates);
        }} /> {asDegree(rotates[selectedLinkage]).toFixed(3)}°
      </div>}
      {mode === 'IK' && <div>
        target position: (<span style={{color: 'red'}}>Red</span> point)
        <div> x=<input type="number" value={target![0]} min={-10} max={10} onChange={(e) => setTarget(vec3.fromValues(finiteOr(parseFloat(e.target.value)), target![1], target![2]))}></input></div>
        <div> y=<input type="number" value={target![1]} min={-10} max={10} onChange={(e) => setTarget(vec3.fromValues(target![0], finiteOr(parseFloat(e.target.value)), target![2]))}></input></div>
        <div> z=<input type="number" value={target![2]} min={-10} max={10} onChange={(e) => setTarget(vec3.fromValues(target![0], target![1], finiteOr(parseFloat(e.target.value))))}></input></div>
      </div>}
      {/* <div>
        Pitch: <input type="number" value={asDegree(pitches[selectedLinkage])} onChange={(e) => {
          const pitch = parseFloat(e.target.value) as Degree;
          if (isNaN(pitch)) {
            return;
          }
          const newPitches = pitches.slice();
          newPitches[selectedLinkage] = asRadians(pitch);
          setPitches(newPitches);
        }} /> {asDegree(pitches[selectedLinkage]).toFixed(3)} °
      </div>
      <div>
        Rotate: <input type="number" value={asDegree(rotates[selectedLinkage])} onChange={(e) => {
          const rotate = parseFloat(e.target.value) as Degree;
          if (isNaN(rotate)) {
            return;
          }
          const newRotates = rotates.slice();
          newRotates[selectedLinkage] = asRadians(rotate);
          setRotates(newRotates);
        }} /> {asDegree(rotates[selectedLinkage]).toFixed(3)} °
      </div> */}
      <div>
        <button onClick={() => {
          setSelectedLinkage(1);
          setPitches(fiveZeroRadians());
          setRotates(fiveZeroRadians());
          if (mode === 'IK') {
            setTarget(vec3.fromValues(4, 0, 0));
          } else {
            setTarget(null);
          }
        }}>Reset</button>
      </div>
      <div> Linkages:
        <ol>
          <li> {dump(linkages[0])} </li>
          <li> {dump(linkages[1])}, length={vec3.length(diff(1, 0, linkages)).toFixed(2)} </li>
          <li> {dump(linkages[2])}, length={vec3.length(diff(2, 1, linkages)).toFixed(2)}, angle={asDegree(vec3.angle(diff(2, 1, linkages), diff(1, 0, linkages)) as Radians).toFixed(2)}° </li>
          <li> {dump(linkages[3])}, length={vec3.length(diff(3, 2, linkages)).toFixed(2)}, angle={asDegree(vec3.angle(diff(3, 2, linkages), diff(2, 1, linkages)) as Radians).toFixed(2)}° </li>
          <li> {dump(linkages[4])}, length={vec3.length(diff(4, 3, linkages)).toFixed(2)}, angle={asDegree(vec3.angle(diff(4, 3, linkages), diff(3, 2, linkages)) as Radians).toFixed(2)}° </li>
        </ol>
      </div>
      <div>
        <p>Algorithm and Implementation Details</p>
        <ol>
          
          <li><p>3D Control: reimplemented the 3D control system using the <code>gl-matrix</code> library.</p></li>
          <li>
            <p>Forward Kinematics (FK):</p>
            <p>
              Suppose we have n linkages <b>L</b><sub>1</sub>, <b>L</b><sub>2</sub>, ..., <b>L</b><sub>n</sub>, (where n=4 in this assignment)
              and the length of each linkage is l<sub>1</sub>, l<sub>2</sub>, ..., l<sub>n</sub>.
              The parent linkage of <b>L</b><sub>i</sub> is <b>L</b><sub>i-1</sub>, and <b>L</b><sub>1</sub> = (0, 0, 0).
            </p>
            <p>
              To uniquely determine the position and orientation of every linkage, 
              we use <code>pitch<sub>i</sub></code> and <code>rotate<sub>i</sub></code> to represent the attitude of linkage <b>L</b><sub>i</sub> with respect to its parent linkage <b>L</b><sub>i-1</sub>.</p>
              we have tried other approaches such as using position vector directly, but it is <b>very</b> numerically unstable.
              In following implementation, we normalize each vector that can be normalized, to avoid numerical instability.
            <p>
              <code>pitch<sub>i</sub></code> is the angle between <b>L</b><sub>i</sub> and its parent <b>L</b><sub>i-1</sub>, 
              and <code>rotate<sub>i</sub></code> is the angle between <b>L</b><sub>i</sub> and the <code><b>up</b><sub>i</sub></code> vector in <b>L</b><sub>i</sub>'s local coordinate system. </p>
            <p><code><b>up</b><sub>1</sub></code> vector is fixed to (0, 1, 0), and we suppose that <b>L</b><sub>1</sub> has a 'virtual' parent linkage parallel to the x-axis.</p>
            <p>
              To obtain each linkage's position and orientation, 
              we begin with <code>up<sub>1</sub></code> = (0, 1, 0), <code>view<sub>1</sub></code> = (1, 0, 0), and <b>L</b><sub>1</sub> (0, 0, 0), 
              calculate the rotatation quaternion <code>q<sub>i</sub></code> for each linkage <b>L</b><sub>i</sub> using the <code>pitch<sub>i</sub></code> and <code>rotate<sub>i</sub></code>. 
              After we get <b>L</b><sub>i</sub>, we also need to rotate <code>up<sub>i</sub></code> by <code>q<sub>i</sub></code> to obtain <code>up<sub>i+1</sub></code>.
              Note that <code>q<sub>i</sub></code>'s rotation axis is parallel to <b>L</b><sub>i-1</sub>. For concrete Implementation, you can refer to the <code>fk</code> function. (<code>fk</code> stands for nothing but forward kinematics)
            </p>
            <p>
              If the implementation is correct, you should see that the length of each linkage is fixed, and part of the angles are fixed (depending on which linkage you select).
            </p>
          </li>
          <li>
            <p>Inverse Kinematics (IK):</p>
            <p>
              To solve the Inverse Kinematics problem, we use the Cyclic Coordinate Descent (CCD) method. 
              The basic idea is to iteratively adjust the orientation of each linkage to make the end effector reach the target position.
            </p>
            <p>
              The algorithm is as a form of backward iteration. We start from the end effector and adjust the orientation of each linkage to make the end effector reach the target position.
              We use the <code>quat.rotationTo</code> function to calculate the quaternion that rotates the current linkage to the target position. But there are a few corner cases that need to be handled carefully:
            </p>
            <ol>
              <li> When the target position is the same as the current position, we should skip to the next iteration directly. </li>
              <li> When calculating the <code>pitch</code> and <code>rotate</code> angles, we should be careful about the sign of the rotation angle. </li>
              <li> Never normalize the zero vector. </li>
              <li> Radian-Degree conversion is necessary. </li>
            </ol>
          </li>
        </ol>
      </div>
    </>);
}

export default App;
