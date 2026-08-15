require('dotenv').config();
const { initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  const db = await initDatabase();

  try {
    if (command === 'list') {
      const admins = await db.all('SELECT id, usuario FROM administradores');
      console.log('\n--- LISTA DE ADMINISTRADORES ---');
      if (admins.length === 0) {
        console.log('No hay administradores registrados.');
      } else {
        admins.forEach(a => console.log(`ID: ${a.id} | Usuario: ${a.usuario}`));
      }
      console.log('--------------------------------\n');
    } 
    else if (command === 'add') {
      const usuario = args[1];
      const password = args[2];

      if (!usuario || !password) {
        console.error(' Error: Debes proporcionar usuario y contraseña.');
        console.log('Uso: node manage-admins.js add <usuario> <contraseña>');
        process.exit(1);
      }

      const existing = await db.get('SELECT * FROM administradores WHERE usuario = ?', [usuario]);
      if (existing) {
        console.error(` Error: El usuario "${usuario}" ya existe.`);
        process.exit(1);
      }

      const hash = await bcrypt.hash(password, 10);
      await db.run('INSERT INTO administradores (usuario, password_hash) VALUES (?, ?)', [usuario, hash]);
      console.log(` Administrador "${usuario}" creado con éxito.`);
    } 
    else if (command === 'change-username') {
      const oldUsername = args[1];
      const newUsername = args[2];

      if (!oldUsername || !newUsername) {
        console.error(' Error: Debes proporcionar el usuario actual y el nuevo nombre de usuario.');
        console.log('Uso: node manage-admins.js change-username <usuario_actual> <nuevo_usuario>');
        process.exit(1);
      }

      const admin = await db.get('SELECT * FROM administradores WHERE usuario = ?', [oldUsername]);
      if (!admin) {
        console.error(` Error: El usuario "${oldUsername}" no existe.`);
        process.exit(1);
      }

      await db.run('UPDATE administradores SET usuario = ? WHERE usuario = ?', [newUsername, oldUsername]);
      console.log(` Nombre de usuario cambiado de "${oldUsername}" a "${newUsername}" con éxito.`);
    }
    else if (command === 'reset-password') {
      const usuario = args[1];
      const newPassword = args[2];

      if (!usuario || !newPassword) {
        console.error(' Error: Debes proporcionar el usuario y la nueva contraseña.');
        console.log('Uso: node manage-admins.js reset-password <usuario> <nueva_contraseña>');
        process.exit(1);
      }

      const admin = await db.get('SELECT * FROM administradores WHERE usuario = ?', [usuario]);
      if (!admin) {
        console.error(` Error: El usuario "${usuario}" no existe.`);
        process.exit(1);
      }

      const hash = await bcrypt.hash(newPassword, 10);
      await db.run('UPDATE administradores SET password_hash = ? WHERE usuario = ?', [hash, usuario]);
      console.log(` Contraseña del usuario "${usuario}" actualizada con éxito.`);
    }
    else if (command === 'delete') {
      const usuario = args[1];

      if (!usuario) {
        console.error(' Error: Debes proporcionar el usuario a eliminar.');
        console.log('Uso: node manage-admins.js delete <usuario>');
        process.exit(1);
      }

      const count = await db.get('SELECT COUNT(*) as total FROM administradores');
      if (count.total <= 1) {
        console.error(' Error: No se puede eliminar el único administrador existente.');
        process.exit(1);
      }

      const result = await db.run('DELETE FROM administradores WHERE usuario = ?', [usuario]);
      if (result.changes === 0) {
        console.error(` Error: El usuario "${usuario}" no existe.`);
      } else {
        console.log(` Administrador "${usuario}" eliminado con éxito.`);
      }
    }
    else {
      console.log(`
==================================================
  HERRAMIENTA DE GESTIÓN DE ADMINISTRADORES
==================================================
Comandos disponibles:

1. Listar administradores:
   node manage-admins.js list

2. Agregar un nuevo administrador:
   node manage-admins.js add <usuario> <contraseña>

3. Cambiar nombre de usuario:
   node manage-admins.js change-username <usuario_actual> <nuevo_usuario>

4. Restablecer contraseña de un usuario:
   node manage-admins.js reset-password <usuario> <nueva_contraseña>

5. Eliminar un administrador:
   node manage-admins.js delete <usuario>
==================================================
      `);
    }
  } catch (error) {
    console.error('Error:', error);
  } process.exit(0);
}

main();
