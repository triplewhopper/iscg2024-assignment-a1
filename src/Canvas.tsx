import React from 'react';
import { vec3, mat4, quat, glMatrix } from 'gl-matrix';
import { WebGLAttributes, WebGLUniforms, getAttribLocations, enableVertexAttribArray, getUniformLocations } from './webgl-utils';

const vs_src = `
attribute vec3 a_vertex;
attribute vec3 a_color;
attribute float a_size;
varying vec3 v_color;
uniform mat4 u_modelview;
uniform mat4 u_projection;
void main() {
        gl_Position = u_projection * u_modelview * vec4(a_vertex, 1.0);
        gl_PointSize = a_size;
        v_color = a_color;
}
`
const fs_src = `
precision mediump float;
varying vec3 v_color;
void main(void) {
        gl_FragColor = vec4(v_color, 1.0);
}
`
function asFloatRgb(rgb: number) {
    return [((rgb >> 16) & 0xff) / 255, ((rgb >> 8) & 0xff) / 255, (rgb & 0xff) / 255] as const;
}

const deep_saffron = asFloatRgb(0xFF9933);

function fillVertices(points: readonly vec3[], target: vec3 | null) {
    const vertices = new Float32Array(points.length * 3 + (target === null ? 0 : 3));
    for (let i = 0; i < points.length; i++) vertices.set(points[i], i * 3);
    if (target !== null) vertices.set(target, points.length * 3);
    return vertices;
}
function fillColors(points: readonly vec3[], target: vec3 | null) {
    const colors = new Float32Array(points.length * 3 + (target === null ? 0 : 3));
    for (let i = 0; i < points.length; i++) colors.set(deep_saffron, i * 3);
    if (target !== null) colors.set([1, 0, 0], points.length * 3);
    return colors;
}
function zxGrid(y: number, minz: number, maxz: number, minx: number, maxx: number, step: number) {
    const vertices = [];
    for (let i = 0; minz + i * step <= maxz; i++) {
        const z = minz + i * step;
        vertices.push(minx, y, z, maxx, y, z);
    }
    for (let i = 0; minx + i * step <= maxx; i++) {
        const x = minx + i * step;
        vertices.push(x, y, minz, x, y, maxz);
    }
    const colors = new Float32Array(vertices.length).fill(0.7);
    return [new Float32Array(vertices), colors] as const;
}
function draw(
    gl: WebGLRenderingContext,
    attributes: WebGLAttributes<['vertex', 'color', 'size']>,
    uniforms: WebGLUniforms<['projection', 'modelview']>,
    ratio: number,
    camera: Camera,
    config: Kinemics3DConfig,
) {
    gl.clearColor(1, 1, 1, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const vertices = fillVertices(config.linkages, config.mode === 'IK' ? config.target : null);
    const colors = fillColors(config.linkages, config.mode === 'IK' ? config.target : null);
    const sizes = new Float32Array(config.linkages.length + (config.mode === 'IK' ? 1 : 0)).fill(5);
    if (config.mode === 'IK') {
        sizes.set([10], config.linkages.length);
    }

    const vertex_buffer = gl.createBuffer();
    const color_buffer = gl.createBuffer();
    const size_buffer = gl.createBuffer();
    if (!vertex_buffer || !color_buffer || !size_buffer) {
        throw new Error('Buffer creation failed');
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, size_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, sizes, gl.STATIC_DRAW);
    gl.vertexAttribPointer(attributes.size, 1, gl.FLOAT, false, 0, 0);

    const modelview = mat4.lookAt(mat4.create(), camera.eye, camera.center, camera.up);
    gl.uniformMatrix4fv(uniforms.modelview, false, modelview);
    const projection = mat4.perspective(mat4.create(), Math.PI / 6, ratio, 0.1, 100);
    gl.uniformMatrix4fv(uniforms.projection, false, projection);

    {
        const [gridVertices, gridColor] = zxGrid(0, -10.125, 10.125, -10.125, 10.125, 0.25);
        const grid_vertex_buffer = gl.createBuffer();
        const grid_color_buffer = gl.createBuffer();
        if (!grid_vertex_buffer || !grid_color_buffer) {
            throw new Error('Buffer creation failed');
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, grid_vertex_buffer);
        gl.bufferData(gl.ARRAY_BUFFER, gridVertices, gl.STATIC_DRAW);
        gl.vertexAttribPointer(attributes.vertex, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, grid_color_buffer);
        gl.bufferData(gl.ARRAY_BUFFER, gridColor, gl.STATIC_DRAW);
        gl.vertexAttribPointer(attributes.color, 3, gl.FLOAT, false, 0, 0);

        gl.drawArrays(gl.LINES, 0, gridVertices.length / 3);
        gl.deleteBuffer(grid_vertex_buffer);
        gl.deleteBuffer(grid_color_buffer);
    }
    
    gl.bindBuffer(gl.ARRAY_BUFFER, vertex_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);
    gl.vertexAttribPointer(attributes.vertex, 3, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, color_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.vertexAttribPointer(attributes.color, 3, gl.FLOAT, false, 0, 0);
    
    gl.drawArrays(gl.LINE_STRIP, 0, config.linkages.length);
    gl.drawArrays(gl.POINTS, 0, config.linkages.length + (config.mode === 'IK' ? 1 : 0));

    colors.set([0.2, 0.5, 1], config.selectedLinkage * 3 - 3);
    colors.set([0.2, 0.5, 1], config.selectedLinkage * 3);
    gl.bindBuffer(gl.ARRAY_BUFFER, color_buffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
    gl.drawArrays(gl.LINES, config.selectedLinkage - 1, 2);
    gl.drawArrays(gl.POINTS, config.selectedLinkage, 1);

    gl.deleteBuffer(vertex_buffer);
    gl.deleteBuffer(color_buffer);
    // gl.deleteBuffer(size_buffer);
    

}


export type Kinemics3DConfig = {
    readonly mode: 'FK',
    readonly linkages: readonly vec3[], // the first one is the base
    readonly selectedLinkage: number,
}| {
    readonly mode: 'IK',
    readonly linkages: readonly vec3[], // the first one is the base
    readonly selectedLinkage: number,
    readonly target: vec3,
};
type Camera = { readonly eye: vec3, readonly center: vec3, readonly up: vec3, readonly right: vec3 };

type event = React.MouseEvent<HTMLCanvasElement>;

export function KinematicsCanvas({ config, canvasSize }: { config: Kinemics3DConfig, canvasSize: readonly [number, number] }) {
    
    const canvasRef = React.useRef<HTMLCanvasElement>(null);
    const [gl, setGL] = React.useState<WebGLRenderingContext | null>(null);
    const [attributes, setAttributes] = React.useState<WebGLAttributes<['vertex', 'color', 'size']> | null>(null);
    const [uniforms, setUniforms] = React.useState<WebGLUniforms<['projection', 'modelview']> | null>(null);

    const [leftClicked, setLeftClicked] = React.useState(false);
    const [previousMousePosition, setPreviousMousePosition] = React.useState<{ x: number, y: number } | null>(null);
    const [camera, setCamera] = React.useState<Camera>({
        eye: vec3.fromValues(0, 10, 0), // z-axis is pointing out of the screen in WebGL
        center: vec3.fromValues(0, 0, 0), // look at the origin
        up: vec3.fromValues(0, 0, -1), // y-axis is up
        right: vec3.fromValues(1, 0, 0), // x-axis is right
    });

    React.useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const gl = canvas.getContext('webgl');
        if (!gl) throw new Error('WebGL not supported');
        setGL(gl);
    }, []);

    const program = React.useMemo(() => {
        if (!gl) return null;
        const vs = gl.createShader(gl.VERTEX_SHADER);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!vs || !fs) {
            throw new Error('Shader creation failed');
        }
        gl.shaderSource(vs, vs_src);
        gl.shaderSource(fs, fs_src);
        gl.compileShader(vs);
        gl.compileShader(fs);
        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        gl.useProgram(program);
        setGL(gl);
        return program;
    }, [gl]);

    React.useEffect(() => {
        if (!gl || !program || !canvasRef.current) return;
        const attributes = getAttribLocations(gl, program, ['vertex', 'color', 'size'] as const);
        const uniforms = getUniformLocations(gl, program, ['modelview', 'projection'] as const);
        enableVertexAttribArray(gl, attributes);
        gl.viewport(0, 0, canvasRef.current.width, canvasRef.current.height);
        console.log('webgl loaded');
        setAttributes(attributes);
        setUniforms(uniforms);
    }, [gl, program]);

    React.useEffect(() => {
        if (!gl || !attributes || !uniforms) return;
        draw(gl, attributes, uniforms, canvasSize[0] / canvasSize[1], camera, config);
    }, [gl, attributes, uniforms, camera, config, canvasSize]);

    function rotateCamera(dx: number, dy: number) {
        const rx = quat.setAxisAngle(quat.create(), camera.right, glMatrix.toRadian(-dy));
        const ry = quat.setAxisAngle(quat.create(), camera.up, glMatrix.toRadian(-dx));
        const r = quat.mul(quat.create(), ry, rx);
        const center_to_eye = vec3.sub(vec3.create(), camera.eye, camera.center);
        vec3.transformQuat(camera.eye, center_to_eye, r);
        vec3.transformQuat(camera.up, camera.up, r);
        vec3.normalize(camera.up, camera.up);
        const right = vec3.cross(vec3.create(), camera.up, camera.eye);
        vec3.normalize(right, right);
        vec3.add(camera.eye, camera.eye, camera.center);
        // console.log({ ...camera, right })
        setCamera({ ...camera, right });
    }

    function onmousemove(e: event) {
        if (!gl || !attributes || !uniforms || !canvasRef.current || !leftClicked || !previousMousePosition) return;
        const dx = (e.clientX - previousMousePosition.x);
        const dy = (e.clientY - previousMousePosition.y);
        // this dy is inverted because the y-axis is inverted in the canvas
        // i.e. flipped compared to canvas.get_mousepos
        rotateCamera(dx, dy);
        setPreviousMousePosition({ x: e.clientX, y: e.clientY });
    }
    return (
        <>
            <div style={{ position: 'relative' }}>
                <canvas
                    ref={canvasRef}
                    id="canvas" width={canvasSize[0]} height={canvasSize[1]}
                    onMouseLeave={() => {}}
                    onMouseMove={onmousemove}
                    onMouseDown={e => {
                        if (e.button === 0) {
                            setLeftClicked(true); 
                            setPreviousMousePosition({ x: e.clientX, y: e.clientY });
                        }
                    }}
                    onMouseUp={e => {
                        if(e.button === 0) {
                            setLeftClicked(false); 
                            setPreviousMousePosition(null);
                        }
                    }}
                    onContextMenu={(e) => {
                        e.preventDefault();
                        return false;
                    }}
                    style={{
                        border: '1px solid black',
                    }}>
                </canvas>
            </div>
            <p> Drag or click button to change view point </p>
            <button onClick={() => rotateCamera(-5, 0)}>{'<'} </button>
            <button onClick={() => rotateCamera(5, 0)}>{'>'} </button>
            <button onClick={() => rotateCamera(0, -5)}>{'^'} </button>
            <button onClick={() => rotateCamera(0, 5)}>{'v'} </button>

            <button onClick={() => {
                const center_to_eye = vec3.sub(vec3.create(), camera.eye, camera.center);
                const rz = quat.setAxisAngle(quat.create(), center_to_eye, -1 / 180 * Math.PI);
                vec3.transformQuat(camera.up, camera.up, rz);
                vec3.transformQuat(camera.right, camera.right, rz);
                vec3.normalize(camera.up, camera.up);
                vec3.normalize(camera.right, camera.right);
                setCamera({ ...camera });
            }}> rotate counter clockwise</button>

            <button onClick={() => {
                const center_to_eye = vec3.sub(vec3.create(), camera.eye, camera.center);
                const rz = quat.setAxisAngle(quat.create(), center_to_eye, 1 / 180 * Math.PI);
                vec3.transformQuat(camera.up, camera.up, rz);
                vec3.transformQuat(camera.right, camera.right, rz);
                vec3.normalize(camera.up, camera.up);
                vec3.normalize(camera.right, camera.right);
                setCamera({ ...camera });
            }}> rotate clockwise</button>
            <button onClick={() => {
                setCamera({
                    eye: vec3.fromValues(0, 10, 0),
                    center: vec3.fromValues(0, 0, 0),
                    up: vec3.fromValues(0, 0, -1),
                    right: vec3.fromValues(1, 0, 0),
                });
            }}> reset camera</button>
        </>);

}
