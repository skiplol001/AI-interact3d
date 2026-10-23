using System.Security.Claims;
using Microsoft.AspNetCore.Mvc;
using Interact3D.DTOs.Common;
using Interact3D.DTOs.Model;
using Interact3D.Services.Interfaces;

namespace Interact3D.Controllers.Api;

[ApiController]
[Route("api/[controller]")]
public class ModelApiController : ControllerBase
{
    private readonly IModelService _modelService;
    private readonly IPositionService _positionService;

    public ModelApiController(IModelService modelService, IPositionService positionService)
    {
        _modelService = modelService;
        _positionService = positionService;
    }

    private int GetCurrentUserId()
    {
        // 1. Kiểm tra Claim từ Cookie / JWT
        var claimVal = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (int.TryParse(claimVal, out var idClaim))
            return idClaim;

        // 2. Dự phòng lấy từ Session
        var sessionUserId = HttpContext.Session.GetInt32("UserId");
        if (sessionUserId.HasValue)
            return sessionUserId.Value;

        // 3. Khách vãng lai (Demo guest user ID = 2)
        return 2;
    }

    [HttpGet("list")]
    public async Task<IActionResult> GetModels()
    {
        var userId = GetCurrentUserId();
        var result = await _modelService.GetAvailableModelsAsync(userId);
        return Ok(result);
    }

    [HttpGet("{id}")]
    public async Task<IActionResult> GetModel(int id)
    {
        var userId = GetCurrentUserId();
        var result = await _modelService.GetModelByIdAsync(id, userId);
        if (!result.Success)
            return NotFound(result);

        return Ok(result);
    }

    [HttpGet("position/{modelId}")]
    public async Task<IActionResult> GetPosition(int modelId)
    {
        var userId = GetCurrentUserId();
        var result = await _positionService.GetPositionAsync(userId, modelId);
        return Ok(result);
    }

    [HttpPost("position")]
    public async Task<IActionResult> SavePosition([FromBody] UpdatePositionDto dto)
    {
        if (!ModelState.IsValid)
            return BadRequest(ApiResponse<PositionDto>.Fail("Dữ liệu vị trí không hợp lệ."));

        var userId = GetCurrentUserId();
        var result = await _positionService.SavePositionAsync(userId, dto);
        return Ok(result);
    }
}