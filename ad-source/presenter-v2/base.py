import torch, sys
from diffusers import StableDiffusionPipeline, AutoencoderKL, DPMSolverMultistepScheduler
torch.set_num_threads(4)
vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse")
pipe = StableDiffusionPipeline.from_pretrained("SG161222/Realistic_Vision_V5.1_noVAE", vae=vae, safety_checker=None)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++", final_sigmas_type="sigma_min")
P = ("RAW photo, full body shot of a friendly professional 30 year old Israeli woman standing, long wavy dark brown hair, "
     "wearing an elegant cream silk blouse and high-waisted beige wide-leg trousers, nude heels, smiling warmly with closed lips, "
     "looking at the camera, arms relaxed at her sides, plain light grey studio background, soft even studio lighting, "
     "sharp focus, photorealistic, 50mm")
N = "cartoon, painting, 3d, cgi, deformed, extra limbs, extra fingers, bad hands, bad anatomy, cropped feet, cropped head, blurry, lowres, open mouth, teeth, text, watermark, multiple people"
for seed in map(int, sys.argv[1:]):
    g=torch.Generator().manual_seed(seed)
    im=pipe(P,negative_prompt=N,width=512,height=832,num_inference_steps=28,guidance_scale=6.0,generator=g).images[0]
    im.save(f"v2/pose/base_{seed}.png"); print("saved",seed,flush=True)
