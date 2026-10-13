---
title: Phase 1 — Python Environment & First Programs
description: 'What Python is, how Python code runs, installing and running Python, and writing your first programs.'
tags: [python, basics, setup]
updated: '2026-10-13'
---

## 1. What Python is

Python is a **general-purpose programming language**: a way to write instructions a computer can follow. It was created by **Guido van Rossum** and first released in **1991**. His goal was a language that is easy to read and quick to write.

**Why it exists:** older languages like C are fast but need many lines for simple tasks. Python trades a little speed for code that reads almost like English, so you spend time solving problems, not fighting syntax.

**Where it is used**

- Web backends (Django, FastAPI, Flask)
- Data analysis and AI (pandas, NumPy, PyTorch)
- Automation and scripts (renaming files, scraping, reports)
- DevOps and testing tools

```python
# Python: read a file and count its lines
with open("notes.txt") as f:
    print(len(f.readlines()))
```

> [!NOTE]
> The same task in C needs file handles, buffers and manual memory work. That readability is why Python is so popular.

**Check yourself**

1. Who created Python, and what was his main goal?
2. Name three areas where Python is used.

## 2. How Python code runs: the interpreter and CPython

Computers only understand machine code. Your Python code must be translated first. The program that does this is the **Python interpreter**.

**How it works (CPython)**

1. You write `hello.py` (plain text).
2. The interpreter **compiles** it into **bytecode**, a simpler set of instructions. Bytecode for imported modules is cached in `__pycache__` as `.pyc` files.
3. The **Python Virtual Machine (PVM)** runs the bytecode line by line.

```text
hello.py  →  compiler  →  bytecode  →  Python Virtual Machine  →  output
```

**Python implementations:** "Python" is the language. An implementation is a program that runs it.

| Implementation | Written in | Used for |
| --- | --- | --- |
| **CPython** | C | The official, default Python. This is what you install. |
| PyPy | Python (RPython) | Faster for long-running programs |
| MicroPython | C | Tiny devices and microcontrollers |
| Jython / IronPython | Java / .NET | Running Python inside Java or .NET apps |

> [!TIP]
> When people say "Python", they almost always mean CPython.

**Check yourself**

1. What does the interpreter turn your code into before running it?
2. What is the difference between "Python" and "CPython"?

## 3. Python versions and installing Python

**Versions:** Python 2 reached end of life on 1 January 2020. Always use **Python 3**. A new 3.x version comes out every year. Use the latest stable one from python.org.

**Install on Windows**

1. Go to [python.org/downloads](https://www.python.org/downloads/) and download the latest Python 3.
2. Run the installer and **tick "Add python.exe to PATH"**.
3. Click **Install Now**.
4. Open a **new** terminal and check:

```text
python --version
```

It should print something like `Python 3.x.y`.

**What PATH is:** PATH is a list of folders Windows searches when you type a command. If Python's folder is not on PATH, typing `python` fails.

```text
'python' is not recognized as an internal or external command
```

> [!WARNING]
> If you see that error, Python is either not installed or not on PATH. Re-run the installer and tick "Add to PATH", or use the Windows launcher `py --version`.

**Check yourself**

1. Why should you never start a new project in Python 2?
2. What does PATH do, and what happens if Python isn't on it?

## 4. The REPL vs running `.py` files

There are two ways to run Python code.

**The REPL** (Read, Evaluate, Print, Loop) is an interactive mode for quick experiments. Start it by typing `python` in the terminal.

```text
>>> 2 + 3
5
>>> "hi" * 3
'hihihi'
>>> exit()
```

**A `.py` file** is for real programs you keep and run again. Create `hello.py`:

```python
print("Hello, Python!")
```

Run it from the terminal, in the same folder as the file:

```text
python hello.py
```

| | REPL | `.py` file |
| --- | --- | --- |
| Best for | Testing one line, quick maths | Real programs |
| Saved? | No, gone when you exit | Yes |
| Shows values automatically? | Yes | No, you must use `print()` |

> [!WARNING]
> Typing `python hello.py` *inside* the REPL (`>>>`) gives a SyntaxError. Run files from the normal terminal, not from inside the REPL.

**Check yourself**

1. When would you use the REPL instead of a file?
2. Why does `2 + 3` show `5` in the REPL but show nothing in a `.py` file?

## 5. VS Code, the terminal and IDEs

An **IDE** (Integrated Development Environment) combines an editor, a terminal and tools like error highlighting and debugging. **VS Code** is a free, popular editor that becomes a Python IDE with an extension.

**Set up VS Code for Python**

1. Install [VS Code](https://code.visualstudio.com).
2. Open the Extensions panel (`Ctrl+Shift+X`) and install **Python** by Microsoft.
3. Open a folder: **File → Open Folder**, for example `python-practice`.
4. Create `hello.py`.
5. Press `Ctrl+Shift+P`, type **Python: Select Interpreter**, and pick your Python 3.
6. Click the **Run ▶** button at the top right, or open the terminal (`` Ctrl+` ``) and type `python hello.py`.

**The terminal** is a text window where you type commands. Useful ones:

| Command (Windows) | What it does |
| --- | --- |
| `cd folder-name` | Move into a folder |
| `cd ..` | Go up one folder |
| `dir` | List files in this folder |
| `python file.py` | Run a Python file |
| `cls` | Clear the screen |

**Check yourself**

1. What does the Python extension add to VS Code?
2. Which command moves you into a folder called `projects`?

## 6. Statements and expressions

An **expression** is code that produces a **value**. A **statement** is a complete instruction that **does something**.

```python
3 + 4            # expression → 7
"py" + "thon"    # expression → "python"
age = 20         # statement: stores a value
print(age)       # statement: shows output
```

**Rule of thumb:** if you can put it on the right side of `=`, it's an expression.

```python
total = 3 + 4      # ✅ 3 + 4 is an expression
total = print(5)   # runs, but total becomes None: print() shows a value, it doesn't return it
```

**Real world:** `price * quantity` is an expression (it computes a number). `total = price * quantity` is a statement (it saves that number).

**Check yourself**

1. Is `x = 10` a statement or an expression? What about `10 * 2`?
2. Why is `total` equal to `None` after `total = print(5)`?

## 7. Comments and indentation

**Comments** are notes for humans. Python ignores everything after `#` on a line.

```python
# Calculate the total price including 18% GST
price = 100
total = price * 1.18  # GST is 18%
```

> [!TIP]
> Good comments explain **why**, not **what**. `# add 1 to x` is useless; `# skip the header row` is helpful.

**Indentation** is the spaces at the start of a line. In Python it is **part of the syntax**: it shows which lines belong to a block. The standard is **4 spaces**.

✅ Correct

```python
age = 20
if age >= 18:
    print("Adult")      # inside the if block
print("Done")           # outside, always runs
```

❌ Incorrect

```python
if age >= 18:
print("Adult")
```

```text
IndentationError: expected an indented block after 'if' statement on line 1
```

**Why it fails:** Python expects the line after `if ...:` to be indented. Without it, Python doesn't know what belongs to the `if`.

> [!WARNING]
> Never mix tabs and spaces. VS Code inserts 4 spaces when you press Tab, so keep that setting.

**Check yourself**

1. Why does Python care about indentation when most languages don't?
2. What is the standard indentation size?

## 8. `print()`

`print()` shows output on the screen. It is a **built-in function**, so it is always available.

```python
print("Hello")                       # Hello
print("Age:", 20)                    # Age: 20   (comma adds a space)
print("a", "b", "c", sep="-")        # a-b-c
print("Loading", end="...")          # no new line after
print("done")                        # Loading...done
name = "Parth"
print(f"Hi {name}, welcome!")        # f-string: Hi Parth, welcome!
```

| Argument | Default | What it changes |
| --- | --- | --- |
| `sep` | `" "` | What goes between items |
| `end` | `"\n"` (new line) | What goes at the end |

❌ Common mistakes

```python
print "Hello"            # SyntaxError: Python 3 needs brackets
print("Age: " + 20)      # TypeError: can't add text and a number
```

✅ Fix: `print("Age:", 20)` or `print(f"Age: {20}")`.

**Check yourself**

1. What does `print("x", "y", sep="")` show?
2. Why does `"Age: " + 20` fail?

## 9. `input()`

`input()` pauses the program, shows a message, and waits for the user to type something and press Enter.

```python
name = input("What is your name? ")
print(f"Hello, {name}!")
```

> [!WARNING]
> `input()` **always returns text (a string)**, even if the user types a number.

❌ Incorrect

```python
age = input("Age: ")
print(age + 1)
```

```text
TypeError: can only concatenate str (not "int") to str
```

✅ Correct: convert the text first.

```python
age = int(input("Age: "))
print(f"Next year you will be {age + 1}")
```

If the user types `abc`, `int()` raises `ValueError`. You'll learn to handle that later with `try`/`except`.

**Check yourself**

1. What type does `input()` always return?
2. How do you turn the text `"25"` into the number `25`?

## 10. Program execution flow

Python runs a file **from top to bottom, one line at a time**. A line can only use names that were created **above** it.

```python
print("1. Start")
name = "Parth"
print("2. Name is set")
print(f"3. Hello {name}")
```

❌ Incorrect

```python
print(score)
score = 90
```

```text
NameError: name 'score' is not defined
```

**Why it fails:** when line 1 runs, `score` doesn't exist yet.

> [!NOTE]
> Later, `if`, loops and functions change this flow by skipping, repeating or jumping. The rule stays the same: Python always runs one line at a time, in order.

**Check yourself**

1. In what order does Python run the lines of a file?
2. Why does using a variable before creating it cause a `NameError`?

## 11. Syntax errors and reading error messages

A **syntax error** means your code breaks Python's grammar rules, so Python can't even start running it. Other errors (like `TypeError` or `NameError`) happen **while** the program runs.

| Error | Meaning | Example cause |
| --- | --- | --- |
| `SyntaxError` | Code isn't valid Python | Missing `:` or `)` |
| `IndentationError` | Wrong or missing indentation | Nothing indented after `if ...:` |
| `NameError` | A name doesn't exist (yet) | Typo or used before creating it |
| `TypeError` | Wrong type for an operation | `"5" + 5` |
| `ValueError` | Right type, wrong value | `int("abc")` |

**How to read an error (read from the bottom up)**

```text
  File "hello.py", line 3
    print("Hi"
         ^
SyntaxError: '(' was never closed
```

1. **Last line:** the error type and message, telling you *what* went wrong.
2. **File and line:** *where* it happened (`hello.py`, line 3).
3. **The `^` marker:** the exact spot.

> [!TIP]
> Fix the **first** error shown, then run again. One mistake often causes the others.

**Check yourself**

1. What's the difference between a `SyntaxError` and a `TypeError`?
2. In an error message, which line do you read first?

## Exercises

Try each one yourself before looking anything up.

**Easy**

1. Write a program that prints your name, your city and your favourite language on three lines.
2. Print `2026-10-13` using three separate values and `sep`.

**Medium**

3. Ask the user for their name and birth year, then print how old they turn this year.
4. Ask for two numbers and print their sum, difference, product and division.

**Real-world task**

5. **Bill splitter:** ask for the total bill amount and the number of people, and print how much each person pays, rounded to 2 decimals (hint: `round(x, 2)`).

## Debugging problems

Find and fix every bug in each snippet.

```python
# Bug 1
print("Welcome to Python"
```

```python
# Bug 2
age = input("Enter your age: ")
print("In 5 years you will be " + age + 5)
```

```python
# Bug 3
if 10 > 5:
print("Ten is bigger")
```

```python
# Bug 4
print(message)
message = "Hello"
```

## Cheat sheet

| Task | Code |
| --- | --- |
| Check Python version | `python --version` |
| Start the REPL / exit | `python` / `exit()` |
| Run a file | `python file.py` |
| Comment | `# note` |
| Print values | `print("a", 1, sep=" ", end="\n")` |
| Print with variables |
