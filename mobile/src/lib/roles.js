// Roles: todos son "usuario" (hacen y aportan ejercicios, como en GitHub);
// el "superadmin" además modera (borra contenido de otros y gestiona usuarios).
// La app solo oculta botones: los permisos reales se validan en el backend.
export const esSuper = (u) => u?.rol === 'superadmin';
export const ROL_LABEL = { usuario: 'Usuario', superadmin: 'Superadmin' };
export const esAutor = (u, ejercicio) => !!u && !!ejercicio && ejercicio.creadoPor === u.id;
