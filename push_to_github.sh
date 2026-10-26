#!/bin/bash
echo "Pushing PDF Page Splitter to GitHub (git@github.com:liyanngai1980/pdf-splitter.git)..."
git push -u origin main
if [ $? -eq 0 ]; then
  echo "✅ Push successful! Visit your published app at:"
  echo "https://liyanngai1980.github.io/pdf-splitter/"
else
  echo "⚠️ Repository not found on GitHub yet."
  echo "Please create the empty repository first at: https://github.com/new?name=pdf-splitter"
  echo "Then run this script again: ./push_to_github.sh"
fi
