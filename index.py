from urllib import request

import flask
import os
import psycopg2
from flask import Flask, app, render_template, redirect, session, request

import database
from database import db_version

app = Flask(__name__)
app.secret_key = "secret_key"

try:
    conn = psycopg2.connect(
        host="localhost",
        database="postgres2",
        user="postgres",
        password="987091werf",
        port="5432"
    )

    cursor = conn.cursor()

    cursor.execute("SELECT version();")

    db_version = cursor.fetchone()
    print("Подключено")

except Exception as error:
    print(error)

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/dashboard', methods=['GET', 'POST'])
def dashboard():
    conn.rollback()

    cur = conn.cursor()
    cur.execute("""
        SELECT * FROM application
        WHERE user_id=%s
        AND status='Обучение завершено' 
        """, (session["user_id"],))

    completed = cur.fetchall()

    return render_template("dashboard.html")


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == "POST":
        cur = conn.cursor()

        cur.execute("""
            SELECT id FROM users WHERE login=%s AND password=%s""",
                    (request.form["login"], request.form["password"]))

        user = cur.fetchone()

        if user:
            session["user_id"] = user[0]

            if request.form["login"] == "Admin" and request.form["password"] == "KorokNET":
                session["admin"] = True
                return redirect("admin")

            return redirect("dashboard")

        return "Ошибка входа"

    return render_template("login.html", error="Неверный логин или пароль")


@app.route('/registration', methods=['GET', 'POST'])
def registration():
    if request.method == "POST":
        cur = conn.cursor()

        cur.execute("SELECT * FROM users WHERE login=%s", (request.form["login"],))

        existing = cur.fetchone()

        if existing:
            return render_template("registration.html", error="Логин уже занят")

        cur.execute("""
        INSERT INTO users (login, password, fio, phone, email)
        VALUES (%s, %s, %s, %s, %s)""",(
            request.form["login"],
            request.form["password"],
            request.form["fio"],
            request.form["phone"],
            request.form["email"]
        ))

        conn.commit()
        return redirect("/login")

    return render_template('registration.html')

@app.route('/create', methods=['GET', 'POST'])
def create():
   cur = conn.cursor()
   cur.execute("""
    INSERT INTO application (course_name, start_date, payment_method, user_id)
    VALUES (%s, %s, %s, %s)""", (
       request.form["course_name"],
       request.form["start_date"],
       request.form["payment_method"],
       session["user_id"]
   ))

   conn.commit()
   return redirect("/dashboard")


@app.route('/admin', methods = ['GET', 'POST'])
def admin():
    if not session.get("admin"):
        return "Нет доступа"

    cur = conn.cursor()
    cur.execute("SELECT * FROM application")
    apps = cur.fetchall()

    return render_template("admin.html", apps=apps)


@app.route("/admin/<int:id>/<status>", methods=['GET', 'POST'])
def change_status(id, status):
    if not session.get("admin"):
        return "Нет доступа"

    if status in ["Идет обучение", "обучение завершено"]:
        cur = conn.cursor()

        cur.execute("""
        UPDATE application SET status=%s WHERE id=%s""", (status, id))
        print(cur.rowcount)

        conn.commit()

    return redirect("/admin")

if __name__ == ("__main__"):
    app.run(debug=True, port=5000)