export type Radians = number & { __radians__: never };
export type Degree = number & { __degree__: never };

export function asRadians(deg: Degree): Radians {
    return deg * Math.PI / 180 as Radians;
}

export function asDegree(rad: Radians): Degree {
    return rad * 180 / Math.PI as Degree;
}