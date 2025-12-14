export const vec3 = {
  magnitude(a) {
    const [x, y, z] = a;
    return Math.sqrt(x * x + y * y + z * z);
  },

  normalize(a) {
    const [x, y, z] = a;
    const m = vec3.magnitude(a) || 1;
    return [x / m, y / m, z / m];
  },
};
