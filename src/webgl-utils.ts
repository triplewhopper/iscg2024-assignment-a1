export type WebGLAttributes<T> = T extends string[] ? {
    [K in T[number]]: number;
} : never;

export type WebGLUniforms<T> = T extends string[] ? {
    [K in T[number]]: WebGLUniformLocation;
} : never;

export function getAttribLocations<T extends readonly string[]>(gl: WebGLRenderingContext, program: WebGLProgram, names: T) {
    return names.reduce((acc, name) => {
        const loc = gl.getAttribLocation(program, `a_${name}`);
        if (loc < 0) throw new Error(`Attribute ${name} not found`);
        return { ...acc, [name]: loc };
    }, {} as WebGLAttributes<T>);
}

export function enableVertexAttribArray<T extends string[]>(gl: WebGLRenderingContext, attributes: WebGLAttributes<T>) {
    for (const k in attributes) {
        gl.enableVertexAttribArray(attributes[k]);
    }
}

export function getUniformLocations<T extends readonly string[]>(gl: WebGLRenderingContext, program: WebGLProgram, names: T) {
    return names.reduce((acc, name) => {
        const loc = gl.getUniformLocation(program, `u_${name}`);
        if (!loc) throw new Error(`Uniform ${name} not found`);
        return { ...acc, [name]: loc };
    }, {} as WebGLUniforms<T>);
}

