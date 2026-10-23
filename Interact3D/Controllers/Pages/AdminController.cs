using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Interact3D.DTOs.Model;
using Interact3D.Services.Interfaces;

namespace Interact3D.Controllers.Pages;

[Authorize]
public class AdminController : Controller
{
    private readonly IModelService _modelService;
    private readonly IWebHostEnvironment _env;

    public AdminController(IModelService modelService, IWebHostEnvironment env)
    {
        _modelService = modelService;
        _env = env;
    }

    private int GetCurrentUserId()
    {
        var idStr = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return int.TryParse(idStr, out var id) ? id : 2;
    }

    [HttpGet]
    public async Task<IActionResult> Index()
    {
        var userId = GetCurrentUserId();
        var result = await _modelService.GetAvailableModelsAsync(userId);
        return View(result.Data ?? new List<ModelDto>());
    }

    [HttpGet]
    public IActionResult Upload()
    {
        return View(new UploadModelDto());
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Upload(UploadModelDto model)
    {
        if (!ModelState.IsValid)
            return View(model);

        var userId = GetCurrentUserId();
        var result = await _modelService.UploadModelAsync(userId, model, _env.WebRootPath);

        if (!result.Success)
        {
            ModelState.AddModelError(string.Empty, result.Message);
            return View(model);
        }

        TempData["SuccessMessage"] = result.Message;
        return RedirectToAction(nameof(Index));
    }

    [HttpPost]
    [ValidateAntiForgeryToken]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = GetCurrentUserId();
        var isAdmin = User.IsInRole("Admin");

        var result = await _modelService.DeleteModelAsync(id, userId, isAdmin, _env.WebRootPath);
        if (!result.Success)
            TempData["ErrorMessage"] = result.Message;
        else
            TempData["SuccessMessage"] = result.Message;

        return RedirectToAction(nameof(Index));
    }
}