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

5. **View Your Progress**

    After running the script, you can easily view your progress through the generated Markdown file, `README.md`. This file summarizes all your LeetCode submissions and provides a clear overview of your coding journey.

    ### Example Output

    The generated Markdown file will include a table like this:

    | Question # | Finished Date | Title | Submission | Difficulty |
    |:---:|:---:|:---:|:---:|:---:|
    | 1 | 2024-10-01 | [Two Sum](https://leetcode.com/problems/two-sum/description/) | [Python](https://github.com/yutsang/leetcode/blob/main/submissions/1_two_sum.py) | Easy |
    | 2 | 2024-10-02 | [Add Two Numbers](https://leetcode.com/problems/add-two-numbers/description/) | [Python](https://github.com/yutsang/leetcode/blob/main/submissions/2_add_two_numbers.py) | Medium |

    This table will dynamically update each time you run the script, providing you with a comprehensive log of your submissions, including:

    - **Question #:** The number assigned to the question.
    - **Finished Date:** The date when you completed the submission.
    - **Title:** The title of the question with a direct link to its description on LeetCode.
    - **Submission:** A link to your solution code stored in your GitHub repository.
    - **Difficulty:** The difficulty level of the question (Easy, Medium, Hard).

## Conclusion

With `autoleetcode`, you can streamline your LeetCode submission tracking process and focus more on solving problems rather than managing logs. For any bugs or feature requests, feel free to open an issue on [GitHub](https://github.com/yutsang/leetcode/issues).

For more details and usage instructions, please refer to the [Usage Guide](https://github.com/yutsang/leetcode/blob/main/autoleetcode.md).

Happy coding!