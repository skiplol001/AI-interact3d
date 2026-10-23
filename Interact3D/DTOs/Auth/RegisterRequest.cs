using System.ComponentModel.DataAnnotations;

namespace Interact3D.DTOs.Auth;

public class RegisterRequest
{
    [Required(ErrorMessage = "Tên đăng nhập không được để trống")]
    [StringLength(50, MinimumLength = 3, ErrorMessage = "Tên đăng nhập từ 3 đến 50 ký tự")]
    public string Username { get; set; } = string.Empty;

    [Required(ErrorMessage = "Mật khẩu không được để trống")]
    [StringLength(100, MinimumLength = 6, ErrorMessage = "Mật khẩu tối thiểu 6 ký tự")]
    public string Password { get; set; } = string.Empty;

    [Compare("Password", ErrorMessage = "Mật khẩu xác nhận không trùng khớp")]
    public string ConfirmPassword { get; set; } = string.Empty;

    [MaxLength(100)]
    public string? DisplayName { get; set; }

    [EmailAddress(ErrorMessage = "Email không đúng định dạng")]
    public string? Email { get; set; }
}