set -e
cd "$(dirname "$0")/../SadTalker"; . .venv/bin/activate
mkdir -p ../v2/talk
for pair in "1 welcome" "2 point" "3 present" "4 show" "5 welcome:cta"; do
  set -- $pair; i=$1; p=${2%%:*}; o=${2##*:}
  [ -f ../v2/talk/$o.mp4 ] && continue
  python -c "from PIL import Image; im=Image.open('../v2/pose/pose_$p.png'); im.resize((768,1248),Image.LANCZOS).save('../v2/pose/up_$p.png')"
  rm -rf ../v2/talk/tmp_$o
  python inference.py --driven_audio ../v2/vo/l$i.wav --source_image ../v2/pose/up_$p.png --result_dir ../v2/talk/tmp_$o --cpu --size 256 --preprocess full --still --expression_scale 1.15 > ../v2/talk/$o.log 2>&1
  mv ../v2/talk/tmp_$o/*.mp4 ../v2/talk/$o.mp4 && echo "done $o"
done
echo ALL_DONE
