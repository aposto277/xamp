const express = require('express');
const session = require('express-session');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(__dirname));
app.use(session({
    secret: 'exam_secret_key',
    resave: false,
    saveUninitialized: true
}));

// Подключение к PostgreSQL
const pool = new Pool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
});

// Инициализация БД и запуск сервера
pool.connect(async (err) => {
    if (err) {
        console.error('❌ БД не подключена:', err.message);
        console.log('Проверьте: 1) PostgreSQL запущен 2) БД создана 3) Пароль в .env правильный');
        return;
    }
    console.log('✅ БД подключена');

    // Создание таблицы пользователей
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            login VARCHAR(50) UNIQUE NOT NULL,
            email VARCHAR(100) UNIQUE NOT NULL,
            password VARCHAR(255) NOT NULL,
            fio VARCHAR(100) NOT NULL,
            phone VARCHAR(20) NOT NULL,
            is_admin BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Создание таблицы заявок
    await pool.query(`
        CREATE TABLE IF NOT EXISTS applications (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id),
            course_name VARCHAR(100) NOT NULL,
            start_date DATE NOT NULL,
            payment_method VARCHAR(20) NOT NULL,
            status VARCHAR(50) DEFAULT 'Новая',
            review TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Создание администратора (если нет)
    const adminCheck = await pool.query(`SELECT * FROM users WHERE login = 'Admin'`);
    if (adminCheck.rows.length === 0) {
        const hashedPass = bcrypt.hashSync('KorokNET', 10);
        await pool.query(`
            INSERT INTO users (login, email, password, fio, phone, is_admin)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, ['Admin', 'admin@exam.com', hashedPass, 'Администратор', '8(000)000-00-00', true]);
        console.log('✅ Админ создан: Admin / KorokNET');
    }

    console.log('✅ Таблицы готовы');

    // Запуск сервера
    app.listen(PORT, () => {
        console.log(`\n🚀 СЕРВЕР ЗАПУЩЕН!`);
        console.log(`🌐 Откройте: http://localhost:${PORT}`);
        console.log(`👤 Админ: Admin / KorokNET\n`);
    });
});

// ========== API МАРШРУТЫ ==========

// Регистрация
app.post('/api/register', async (req, res) => {
    const { login, email, password, fio, phone } = req.body;
    const errors = [];

    if (login.length < 6 || !/^[a-zA-Z0-9]+$/.test(login)) {
        errors.push('Логин должен быть не менее 6 символов (латиница и цифры)');
    }
    if (password.length < 8) {
        errors.push('Пароль должен быть не менее 8 символов');
    }
    if (!/^[а-яА-ЯёЁ\s]+$/.test(fio)) {
        errors.push('ФИО должно содержать только кириллицу и пробелы');
    }
    if (!/^(\+7|8|7)\(\d{3}\)\d{3}-\d{2}-\d{2}$/.test(phone)) {
        errors.push('Телефон должен быть в формате +7(XXX)XXX-XX-XX или 8(XXX)XXX-XX-XX или 7(XXX)XXX-XX-XX');
    }
    if (!/^[^\s@]+@([^\s@.,]+\.)+[^\s@.,]{2,}$/.test(email)) {
        errors.push('Введите корректный email');
    }

    if (errors.length > 0) {
        return res.json({ success: false, errors });
    }

    try {
        const hashedPass = bcrypt.hashSync(password, 10);
        await pool.query(`
            INSERT INTO users (login, email, password, fio, phone)
            VALUES ($1, $2, $3, $4, $5)
        `, [login, email, hashedPass, fio, phone]);
        res.json({ success: true, message: 'Регистрация успешна! Теперь войдите.' });
    } catch (err) {
        if (err.code === '23505') {
            res.json({ success: false, errors: ['Логин или Email уже занят'] });
        } else {
            res.json({ success: false, errors: ['Ошибка сервера. Попробуйте позже.'] });
        }
    }
});

// Вход
app.post('/api/login', async (req, res) => {
    const { login_or_email, password } = req.body;

    try {
        const result = await pool.query(`
            SELECT * FROM users WHERE login = $1 OR email = $1
        `, [login_or_email]);

        if (result.rows.length > 0 && bcrypt.compareSync(password, result.rows[0].password)) {
            const user = result.rows[0];
            req.session.userId = user.id;
            req.session.isAdmin = user.is_admin;
            req.session.userFio = user.fio;
            res.json({ success: true, isAdmin: user.is_admin });
        } else {
            res.json({ success: false, error: 'Неверный логин/email или пароль' });
        }
    } catch (err) {
        res.json({ success: false, error: 'Ошибка сервера' });
    }
});

// Проверка авторизации
app.get('/api/check-auth', (req, res) => {
    if (req.session.userId) {
        res.json({
            authenticated: true,
            isAdmin: req.session.isAdmin,
            fio: req.session.userFio
        });
    } else {
        res.json({ authenticated: false });
    }
});

// Выход
app.get('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Получить заявки пользователя
app.get('/api/my-applications', async (req, res) => {
    if (!req.session.userId) {
        return res.json([]);
    }

    const result = await pool.query(`
        SELECT * FROM applications 
        WHERE user_id = $1 
        ORDER BY created_at DESC
    `, [req.session.userId]);

    res.json(result.rows);
});

// Создать заявку
app.post('/api/create-application', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ error: 'Не авторизован' });
    }

    const { course_name, start_date, payment_method } = req.body;
    await pool.query(`
        INSERT INTO applications (user_id, course_name, start_date, payment_method)
        VALUES ($1, $2, $3, $4)
    `, [req.session.userId, course_name, start_date, payment_method]);

    res.json({ success: true });
});

// Добавить отзыв
app.post('/api/add-review', async (req, res) => {
    if (!req.session.userId) {
        return res.json({ error: 'Не авторизован' });
    }

    const { app_id, review } = req.body;
    await pool.query(`
        UPDATE applications 
        SET review = $1 
        WHERE id = $2 AND user_id = $3
    `, [review, app_id, req.session.userId]);

    res.json({ success: true });
});

// Получить все заявки (только для админа)
app.get('/api/all-applications', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.json({ error: 'Доступ запрещён' });
    }

    const status = req.query.status || '';
    let query = `
        SELECT a.*, u.login, u.fio, u.email, u.phone 
        FROM applications a 
        JOIN users u ON a.user_id = u.id
    `;
    let params = [];

    if (status && status !== 'all') {
        query += ` WHERE a.status = $1 ORDER BY a.created_at DESC`;
        params = [status];
    } else {
        query += ` ORDER BY a.created_at DESC`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows);
});

// Сменить статус заявки (только для админа)
app.post('/api/change-status', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.json({ error: 'Доступ запрещён' });
    }

    const { app_id, status } = req.body;
    await pool.query(`
        UPDATE applications SET status = $1 WHERE id = $2
    `, [status, app_id]);

    res.json({ success: true });
});

// ========== ОТДАЧА HTML СТРАНИЦ ==========

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/registr.html', (req, res) => res.sendFile(path.join(__dirname, 'registr.html')));
app.get('/main_page.html', (req, res) => res.sendFile(path.join(__dirname, 'main_page.html')));
app.get('/admin.html', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));