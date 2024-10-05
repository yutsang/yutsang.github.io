---
layout: post
title: "Automate Update Leetcode Progress Recording"
date:   2024-10-05
tags: [webparsing]
comments: true
author: yutsang
---

# Introducing `autoleetcode`: Automate Your LeetCode Submission Logging

I'm excited to share a new tool I've developed called **`autoleetcode`**. This Python script automates the process of logging your LeetCode submissions, making it easier for you to track your progress and improve your coding skills.

## What is `autoleetcode`?

`autoleetcode` is a Python script that uses Selenium to log into your LeetCode account and scrape submission data. It compiles this information into a structured format, allowing you to maintain a comprehensive study log of your coding challenges.

### Key Features

- **Automated Login:** The script automatically logs into your LeetCode account using your GitHub credentials.
- **Submission Tracking:** It collects and logs all your submissions, including the question title, submission date, and status.
- **Markdown Report Generation:** The tool generates a Markdown file summarizing your progress, which you can easily integrate into your personal blog or portfolio.

## How to Use `autoleetcode`

1. **Clone the Repository:**
   Clone the repository from GitHub:
   ```bash
   git clone https://github.com/yutsang/leetcode.git
   ```

2. **Install Dependencies:**
    Make sure you have Python installed along with the required libraries:
    ```bash
    pip install pandas selenium beautifulsoup4 tqdm
    ```

3. **Configuration:**
    Create a configuration file (config.cfg) with your GitHub username and password:
    
    ```bash
    [Settings]
    driverpath = path_to_chromedriver

    [Credentials]
    username = your_github_username
    password = your_github_password
    ```

4. **Run the Script:**
    Execute the script to start logging your submissions:
    ```bash
    python autoleetcode.py
    ```

