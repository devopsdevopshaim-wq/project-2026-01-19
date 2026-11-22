import torch, sys
from diffusers import StableDiffusionPipeline, AutoencoderKL, DPMSolverMultistepScheduler
torch.set_num_threads(4)
vae = AutoencoderKL.from_pretrained("stabilityai/sd-vae-ft-mse", torch_dtype=torch.float32)
pipe = StableDiffusionPipeline.from_pretrained("SG161222/Realistic_Vision_V5.1_noVAE", vae=vae, torch_dtype=torch.float32, safety_checker=None)
pipe.scheduler = DPMSolverMultistepScheduler.from_config(pipe.scheduler.config, use_karras_sigmas=True, algorithm_type="dpmsolver++", final_sigmas_type="sigma_min")
prompt = ("RAW photo, head and shoulders portrait of a friendly smiling 30 year old Israeli woman, long wavy dark brown hair, "
          "natural makeup, wearing an elegant cream blouse, looking straight at the camera, mouth closed, soft warm studio light, "
          "beige blurred background with cream balloons, 85mm, sharp focus, high detail skin, photorealistic")
neg = "cartoon, painting, 3d, cgi, deformed, blurry, lowres, bad anatomy, extra fingers, teeth showing, open mouth, sunglasses, hat, text, watermark"
for seed in [int(s) for s in sys.argv[1:]]:
    g = torch.Generator().manual_seed(seed)
    img = pipe(prompt, negative_prompt=neg, width=512, height=640, num_inference_steps=25, guidance_scale=6.0, generator=g).images[0]
    img.save(f"../portrait/p_{seed}.png"); print("saved", seed, flush=True)
