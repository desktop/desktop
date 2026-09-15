for i in {1..104}; do 
echo "The file is now $i" >> README.md
git commit -am "commit $i"; done